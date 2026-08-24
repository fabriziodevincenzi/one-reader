import Stripe from 'npm:stripe@18.5.0';
import { enqueueMembershipActivatedEmail, syncUpcomingRenewalEmail } from '../_shared/billing-email.ts';
import { createAdminClient, errorMessage, jsonResponse, requireEnvironment } from '../_shared/runtime.ts';

const stripeStatusToAccount = (status: Stripe.Subscription.Status) =>
  ['active', 'trialing'].includes(status) ? 'annual' : ['incomplete', 'past_due', 'unpaid'].includes(status) ? 'checkout_pending' : 'free';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const payload = await request.text();
    const stripe = new Stripe(requireEnvironment('STRIPE_SECRET_KEY'), { apiVersion: '2025-03-31.basil' });
    const signature = request.headers.get('stripe-signature');
    if (!signature) return jsonResponse({ error: 'Missing Stripe signature' }, 401);
    const event = await stripe.webhooks.constructEventAsync(payload, signature, requireEnvironment('STRIPE_WEBHOOK_SECRET'));
    const admin = createAdminClient();
    let processTransactionalOutbox = false;
    const { error: insertError } = await admin.from('stripe_events').insert({ event_id: event.id, event_type: event.type });
    if (insertError?.code === '23505') return jsonResponse({ ok: true, duplicate: true });
    if (insertError) throw insertError;

    if (event.type.startsWith('customer.subscription.')) {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.supabase_user_id || await findUserId(admin, String(subscription.customer), stripe);
      if (userId) {
        const deleted = event.type === 'customer.subscription.deleted';
        const accountStatus = deleted ? 'free' : stripeStatusToAccount(subscription.status);
        const item = subscription.items.data[0];
        if (!deleted && !item) throw new Error('Stripe subscription has no billable item');
        const renewalAt = deleted ? null : new Date(item!.current_period_end * 1000).toISOString();
        const { error } = await admin.from('profiles').update({
          account_status: accountStatus,
          plan: accountStatus === 'annual' ? 'annual' : 'free',
          stripe_customer_id: String(subscription.customer),
          stripe_subscription_id: deleted ? null : subscription.id,
          subscription_status: deleted ? 'canceled' : subscription.status,
          subscription_current_period_start: deleted ? null : new Date(item!.current_period_start * 1000).toISOString(),
          subscription_current_period_end: renewalAt,
          subscription_cancel_at_period_end: deleted ? false : Boolean(subscription.cancel_at_period_end),
          subscription_currency: deleted ? null : item!.price.currency ?? null,
          subscription_unit_amount: deleted ? null : item!.price.unit_amount ?? null,
        }).eq('id', userId);
        if (error) throw error;
        const recipientEmail = await findMemberEmail(admin, userId);
        if (recipientEmail) {
          await syncUpcomingRenewalEmail(admin, {
            memberId: userId,
            recipientEmail,
            subscriptionId: subscription.id,
            status: deleted ? 'canceled' : subscription.status,
            cancelAtPeriodEnd: deleted || Boolean(subscription.cancel_at_period_end),
            renewalAt,
            currency: deleted ? null : item!.price.currency,
            unitAmount: deleted ? null : item!.price.unit_amount,
          });
        }
      }
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id || session.client_reference_id;
      if (userId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
        const accountStatus = stripeStatusToAccount(subscription.status);
        const item = subscription.items.data[0];
        if (!item) throw new Error('Stripe subscription has no billable item');
        const renewalAt = new Date(item.current_period_end * 1000).toISOString();
        const { error } = await admin.from('profiles').update({
          account_status: accountStatus,
          plan: accountStatus === 'annual' ? 'annual' : 'free',
          stripe_customer_id: String(session.customer),
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status,
          subscription_current_period_start: new Date(item.current_period_start * 1000).toISOString(),
          subscription_current_period_end: renewalAt,
          subscription_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
          subscription_currency: item.price.currency ?? null,
          subscription_unit_amount: item.price.unit_amount ?? null,
        }).eq('id', userId);
        if (error) throw error;
        const recipientEmail = await findMemberEmail(admin, userId);
        if (recipientEmail) {
          const emailInput = {
            memberId: userId,
            recipientEmail,
            subscriptionId: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
            renewalAt,
            currency: item.price.currency,
            unitAmount: item.price.unit_amount,
          };
          await enqueueMembershipActivatedEmail(admin, emailInput);
          await syncUpcomingRenewalEmail(admin, emailInput);
          processTransactionalOutbox = true;
        }
      }
    }
    await admin.from('stripe_events').update({ processed_at: new Date().toISOString() }).eq('event_id', event.id);
    if (processTransactionalOutbox) triggerTransactionalWorker();
    return jsonResponse({ received: true });
  } catch (error) {
    console.error('Stripe webhook failed', error);
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
});

async function findUserId(admin: ReturnType<typeof createAdminClient>, customerId: string, stripe: Stripe) {
  const { data } = await admin.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
  if (data?.id) return data.id;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.email) return null;
  const { data: profile } = await admin.from('profiles').select('id').ilike('email_address', customer.email).maybeSingle();
  return profile?.id ?? null;
}

async function findMemberEmail(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.from('profiles').select('email_address').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.email_address as string | undefined;
}

function triggerTransactionalWorker() {
  const secret = Deno.env.get('WORKER_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!secret || !supabaseUrl) return;
  EdgeRuntime.waitUntil(fetch(`${supabaseUrl}/functions/v1/transactional-worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }));
}
