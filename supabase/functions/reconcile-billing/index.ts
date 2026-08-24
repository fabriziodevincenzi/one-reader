import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { enqueueMembershipActivatedEmail, syncUpcomingRenewalEmail } from '../_shared/billing-email.ts';
const requireEnvironment = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`${name} is not configured`); return value; };
const createAdminClient = () => createClient(requireEnvironment('SUPABASE_URL'), requireEnvironment('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const stripeStatusToAccount = (status: Stripe.Subscription.Status) =>
  ['active', 'trialing'].includes(status) ? 'annual' : ['incomplete', 'past_due', 'unpaid'].includes(status) ? 'checkout_pending' : 'free';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return response({ error: 'Authentication required' }, 401);
    const supabaseUrl = requireEnvironment('SUPABASE_URL');
    const authClient = createClient(supabaseUrl, requireEnvironment('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return response({ error: 'Invalid authentication' }, 401);

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, account_status, stripe_customer_id')
      .eq('id', userData.user.id)
      .single();
    if (profileError) throw profileError;
    if (profile.account_status === 'closed' || !profile.stripe_customer_id) {
      return response({ status: profile.account_status, reconciled: false });
    }

    const stripe = new Stripe(requireEnvironment('STRIPE_SECRET_KEY'), { apiVersion: '2025-03-31.basil' });
    const subscriptions = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 20 });
    const subscription = subscriptions.data
      .filter((item) => ['active', 'trialing', 'incomplete', 'past_due', 'unpaid'].includes(item.status))
      .sort((a, b) => b.created - a.created)[0];
    if (!subscription) return response({ status: 'free', reconciled: false });

    const accountStatus = stripeStatusToAccount(subscription.status);
    const item = subscription.items.data[0];
    if (!item) throw new Error('Stripe subscription has no billable item');
    const renewalAt = new Date(item.current_period_end * 1000).toISOString();
    const currency = item.price.currency ?? null;
    const unitAmount = item.price.unit_amount ?? null;
    const { error: updateError } = await admin.from('profiles').update({
      account_status: accountStatus,
      plan: accountStatus === 'annual' ? 'annual' : 'free',
      stripe_subscription_id: subscription.id,
      subscription_current_period_start: new Date(item.current_period_start * 1000).toISOString(),
      subscription_status: subscription.status,
      subscription_current_period_end: renewalAt,
      subscription_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      subscription_currency: currency,
      subscription_unit_amount: unitAmount,
      updated_at: new Date().toISOString(),
    }).eq('id', userData.user.id);
    if (updateError) throw updateError;
    const emailInput = {
      memberId: userData.user.id,
      recipientEmail: userData.user.email ?? '',
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      renewalAt,
      currency,
      unitAmount,
    };
    await enqueueMembershipActivatedEmail(admin, emailInput);
    await syncUpcomingRenewalEmail(admin, emailInput);
    triggerTransactionalWorker(supabaseUrl);
    return response({ status: accountStatus, subscription_status: subscription.status, reconciled: true });
  } catch (error) {
    console.error('Billing reconciliation failed', error);
    return response({ error: errorMessage(error) }, 400);
  }
});

function triggerTransactionalWorker(supabaseUrl: string) {
  const secret = Deno.env.get('WORKER_SECRET');
  if (!secret) return;
  EdgeRuntime.waitUntil(fetch(`${supabaseUrl}/functions/v1/transactional-worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }));
}
