import { Resend } from 'npm:resend@6.18.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { enqueueTransactionalEmail } from '../_shared/transactional-outbox.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const env = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`${name} is not configured`); return value; };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return response({ error: 'Authentication required' }, 401);
    const supabaseUrl = env('SUPABASE_URL');
    const auth = createClient(supabaseUrl, env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
    const { data: userData, error: authError } = await auth.auth.getUser(token);
    if (authError || !userData.user?.email) return response({ error: 'Invalid authentication' }, 401);
    const body = await request.json().catch(() => ({})) as { request_type?: unknown; reason?: unknown };
    const requestType = body.request_type;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!['withdrawal_14_day', 'service_issue', 'goodwill'].includes(String(requestType))) return response({ error: 'Choose a valid request type' }, 400);
    if (reason.length < 10 || reason.length > 2000) return response({ error: 'Please provide between 10 and 2000 characters' }, 400);
    const admin = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from('profiles').select('stripe_customer_id, stripe_subscription_id, subscription_current_period_start').eq('id', userData.user.id).single();
    if (profileError) throw profileError;
    const activatedAt = profile.subscription_current_period_start ? new Date(profile.subscription_current_period_start).getTime() : NaN;
    const ageDays = Number.isFinite(activatedAt) ? Math.max(0, (Date.now() - activatedAt) / 86400000) : 0;
    if (requestType === 'withdrawal_14_day' && ageDays > 14) return response({ error: 'The 14-day withdrawal window has passed. You can still request a review for a service problem or incorrect charge.' }, 422);
    if (requestType === 'goodwill' && ageDays > 30) return response({ error: 'The 30-day commercial refund window has passed. You can still request a review for a service problem or incorrect charge.' }, 422);
    const { data: refundRequest, error: insertError } = await admin.from('refund_requests').insert({ user_id: userData.user.id, request_type: requestType, reason, stripe_customer_id: profile.stripe_customer_id, stripe_subscription_id: profile.stripe_subscription_id }).select('id, created_at').single();
    if (insertError) throw insertError;
    await enqueueTransactionalEmail(admin, {
      eventType: 'refund_request_received',
      recipientEmail: userData.user.email,
      memberId: userData.user.id,
      dedupeKey: `refund-request/${refundRequest.id}`,
      payload: { requestId: refundRequest.id, requestType },
    });
    triggerTransactionalWorker();
    try {
      const resend = new Resend(env('RESEND_API_KEY'));
      const from = Deno.env.get('SERVICE_FROM_ADDRESS')?.trim() || 'One Reader <letters@onereader.co>';
      const summary = `Type: ${requestType}\nAccount: ${userData.user.email}\nRequest: ${reason}\nRequest ID: ${refundRequest.id}`;
      await resend.emails.send({ from, to: ['customers@onereader.co'], subject: `Refund request from ${userData.user.email}`, text: summary });
    } catch (notificationError) { console.error('Refund notification failed', notificationError); }
    return response({ request_id: refundRequest.id, request_status: 'requested' });
  } catch (error) {
    console.error('Refund request failed', error);
    return response({ error: error instanceof Error ? error.message : 'Refund request failed' }, 400);
  }
});

function triggerTransactionalWorker() {
  const secret = Deno.env.get('WORKER_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!secret || !supabaseUrl) return;
  EdgeRuntime.waitUntil(fetch(`${supabaseUrl}/functions/v1/transactional-worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }));
}
