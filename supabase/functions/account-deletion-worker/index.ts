import Stripe from 'npm:stripe@18.5.0';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

type DeletionRequest = {
  id: string;
  user_id: string;
  created_at: string;
};

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const createAdminClient = () => createClient(
  requireEnvironment('SUPABASE_URL'),
  requireEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient();
  if (!await authorized(request, admin)) return response({ error: 'Unauthorized' }, 401);

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('privacy_requests')
    .select('id, user_id, created_at')
    .eq('request_type', 'deletion')
    .in('status', ['requested', 'in_progress'])
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(25);
  if (error) return response({ error: error.message }, 500);

  let deleted = 0;
  const failures: Array<{ requestId: string; error: string }> = [];
  for (const deletionRequest of (data ?? []) as DeletionRequest[]) {
    try {
      await deleteAccount(admin, deletionRequest);
      deleted += 1;
    } catch (workerError) {
      failures.push({
        requestId: deletionRequest.id,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  return response({ ok: failures.length === 0, eligible: data?.length ?? 0, deleted, failures });
});

async function deleteAccount(admin: SupabaseClient, deletionRequest: DeletionRequest) {
  const userId = deletionRequest.user_id;
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email_address, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const { error: statusError } = await admin
    .from('privacy_requests')
    .update({ status: 'in_progress' })
    .eq('id', deletionRequest.id);
  if (statusError) throw statusError;

  if (profile?.stripe_subscription_id) {
    const stripe = new Stripe(requireEnvironment('STRIPE_SECRET_KEY'), { apiVersion: '2025-03-31.basil' });
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    if (subscription.status !== 'canceled') {
      await stripe.subscriptions.cancel(profile.stripe_subscription_id);
    }
  }

  const { data: correspondences, error: correspondenceError } = await admin
    .from('correspondences')
    .select('id')
    .or(`starter_id.eq.${userId},recipient_id.eq.${userId}`);
  if (correspondenceError) throw correspondenceError;
  const correspondenceIds = (correspondences ?? []).map((row) => row.id as string);

  let letterIds: string[] = [];
  let providerEmailIds: string[] = [];
  if (correspondenceIds.length > 0) {
    const { data: letters, error: letterError } = await admin
      .from('letters')
      .select('id, provider_inbound_id, provider_outbound_id')
      .in('correspondence_id', correspondenceIds);
    if (letterError) throw letterError;
    letterIds = (letters ?? []).map((row) => row.id as string);
    providerEmailIds = [...new Set((letters ?? []).flatMap((row) => [
      row.provider_inbound_id as string | null,
      row.provider_outbound_id as string | null,
    ]).filter((value): value is string => Boolean(value)))];
  }

  if (correspondenceIds.length > 0) {
    await remove(admin.from('transactional_email_outbox').delete().in('correspondence_id', correspondenceIds));
  }
  if (letterIds.length > 0) {
    await remove(admin.from('transactional_email_outbox').delete().in('letter_id', letterIds));
  }
  await remove(admin.from('transactional_email_outbox').delete().eq('member_id', userId));
  if (profile?.email_address) {
    await remove(admin.from('transactional_email_outbox').delete().eq('recipient_email', profile.email_address));
    await remove(admin.from('leads').delete().eq('email_address', profile.email_address));
  }
  if (providerEmailIds.length > 0) {
    await remove(admin.from('email_provider_events').delete().in('provider_email_id', providerEmailIds));
  }
  if (correspondenceIds.length > 0) {
    await remove(admin.from('correspondences').delete().in('id', correspondenceIds));
  }

  // Deleting the Auth user cascades through the profile and all remaining
  // account-owned records. Product analytics lose their user reference and
  // remain only as anonymous aggregate events.
  const { error: authError } = await admin.auth.admin.deleteUser(userId, false);
  if (authError) throw authError;

  const { error: receiptError } = await admin.from('account_deletion_receipts').insert({
    request_id: deletionRequest.id,
    requested_at: deletionRequest.created_at,
  });
  if (receiptError) throw receiptError;
}

async function remove(query: PromiseLike<{ error: unknown }>) {
  const { error } = await query;
  if (error) throw error;
}

async function authorized(request: Request, admin: SupabaseClient) {
  const authorization = request.headers.get('Authorization');
  const workerSecret = Deno.env.get('WORKER_SECRET');
  if (workerSecret && authorization === `Bearer ${workerSecret}`) return true;

  const scheduledToken = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (!/^[a-f0-9]{64}$/.test(scheduledToken)) return false;
  const { data, error } = await admin.rpc('verify_transactional_worker_token', {
    p_token: scheduledToken,
  });
  return !error && data === true;
}
