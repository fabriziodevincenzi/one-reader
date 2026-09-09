import Stripe from 'npm:stripe@18.5.0';
import { Resend } from 'npm:resend@6.18.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { renderTransactionalEmail } from '../_shared/transactional-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function requireEnvironment(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return response({ error: 'Authentication required' }, 401);

    const supabaseUrl = requireEnvironment('SUPABASE_URL');
    const anonKey = requireEnvironment('SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user?.email) return response({ error: 'Invalid authentication' }, 401);

    const body = await request.json().catch(() => ({})) as { request_type?: unknown };
    const requestType = body.request_type;
    if (requestType !== 'access' && requestType !== 'rectification' && requestType !== 'deletion') {
      return response({ error: 'Invalid privacy request type' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let privacyRequest: { id: string; status: string; created_at: string } | null = null;
    let alreadyRecorded = false;

    if (requestType === 'deletion') {
      const { data: existing, error: existingError } = await admin
        .from('privacy_requests')
        .select('id, status, created_at')
        .eq('user_id', userData.user.id)
        .eq('request_type', 'deletion')
        .in('status', ['requested', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        privacyRequest = existing;
        alreadyRecorded = true;
      }
    }

    if (!privacyRequest) {
      const { data: inserted, error: insertError } = await admin
        .from('privacy_requests')
        .insert({ user_id: userData.user.id, request_type: requestType })
        .select('id, status, created_at')
        .single();
      if (insertError) {
        if (insertError.code === '23505' && requestType === 'deletion') {
          const { data: existing } = await admin
            .from('privacy_requests')
            .select('id, status, created_at')
            .eq('user_id', userData.user.id)
            .eq('request_type', 'deletion')
            .in('status', ['requested', 'in_progress'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!existing) throw insertError;
          privacyRequest = existing;
          alreadyRecorded = true;
        } else {
          throw insertError;
        }
      } else {
        privacyRequest = inserted;
      }
    }

    if (requestType === 'deletion') {
      const { data: billingProfile, error: billingProfileError } = await admin
        .from('profiles')
        .select('stripe_subscription_id')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (billingProfileError) throw billingProfileError;
      if (billingProfile?.stripe_subscription_id) {
        try {
          const stripe = new Stripe(requireEnvironment('STRIPE_SECRET_KEY'), { apiVersion: '2025-03-31.basil' });
          const subscription = await stripe.subscriptions.retrieve(billingProfile.stripe_subscription_id);
          if (subscription.status !== 'canceled') {
            await stripe.subscriptions.cancel(billingProfile.stripe_subscription_id);
          }
        } catch (stripeError) {
          // A payment-provider outage must not prevent a member from exercising
          // the right to deletion. The deletion worker checks again before the
          // final account purge.
          console.error('Could not cancel subscription during deletion request', stripeError);
        }
      }

      const { error: closeError } = await admin
        .from('profiles')
        .update({ account_status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', userData.user.id)
        .neq('account_status', 'closed');
      if (closeError) throw closeError;

      const { error: pauseError } = await admin
        .from('member_preferences')
        .update({ is_available_to_receive: false, updated_at: new Date().toISOString() })
        .eq('user_id', userData.user.id);
      if (pauseError) throw pauseError;
    }

    let notification: Record<string, unknown>;
    try {
      notification = await processPrivacyNotification(admin, privacyRequest, requestType, userData.user.email);
    } catch (error) {
      console.error('Privacy notification failed', error);
      notification = { ok: false, error: error instanceof Error ? error.message : 'Notification failed' };
    }
    return response({
      request_id: privacyRequest?.id,
      request_status: privacyRequest?.status,
      already_recorded: alreadyRecorded,
      notification,
    });
  } catch (error) {
    console.error('Privacy request failed', error);
    return response({ error: error instanceof Error ? error.message : 'Could not record privacy request' }, 400);
  }
});

async function processPrivacyNotification(
  admin: ReturnType<typeof createClient>,
  request: { id: string; status: string; created_at: string } | null,
  requestType: 'access' | 'rectification' | 'deletion',
  recipientEmail: string,
) {
  if (!request) return { ok: false, error: 'Privacy request was not created' };
  const dedupeKey = `privacy-request/${request.id}`;
  const { data: pending, error: selectError } = await admin
    .from('transactional_email_outbox')
    .select('*')
    .eq('dedupe_key', dedupeKey)
    .in('status', ['pending', 'retry'])
    .maybeSingle();
  if (selectError) throw selectError;
  if (!pending) return { ok: true, status: 'already_processed' };

  const { data: claimed, error: claimError } = await admin
    .from('transactional_email_outbox')
    .update({ status: 'processing', attempts: pending.attempts + 1, locked_until: new Date(Date.now() + 120000).toISOString() })
    .eq('id', pending.id)
    .eq('status', pending.status)
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { ok: true, status: 'already_processing' };

  const rendered = renderTransactionalEmail({
    eventType: 'privacy_request_received',
    payload: { requestId: request.id, requestType, requestedAt: request.created_at },
    siteUrl: Deno.env.get('SITE_URL') ?? 'https://onereader.co',
  });
  const mode = (Deno.env.get('TRANSACTIONAL_EMAIL_MODE') ?? 'resend').trim().toLowerCase();
  let providerId: string | null = null;
  if (mode === 'resend') {
    const resend = new Resend(requireEnvironment('RESEND_API_KEY'));
    const { data, error } = await resend.emails.send({
      from: Deno.env.get('SERVICE_FROM_ADDRESS') ?? 'One Reader <letters@onereader.co>',
      to: recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: { 'Auto-Submitted': 'auto-generated', 'X-One-Reader-Event': 'privacy_request_received' },
    }, { idempotencyKey: `transactional/${pending.id}` });
    if (error || !data?.id) throw new Error(error?.message ?? 'The provider did not accept the email');
    providerId = data.id;
  }
  const { error: completeError } = await admin.rpc('complete_transactional_email', {
    p_email_id: pending.id,
    p_provider_outbound_id: providerId,
    p_rendered_subject: rendered.subject,
    p_rendered_html: rendered.html,
    p_rendered_text: rendered.text,
    p_preview: mode !== 'resend',
  });
  if (completeError) throw completeError;
  return { ok: true, status: mode === 'resend' ? 'sent' : 'previewed' };
}
