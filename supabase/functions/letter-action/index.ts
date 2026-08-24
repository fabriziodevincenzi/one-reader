import { verifyLetterActionToken } from '../_shared/action-token.ts';
import { createAdminClient, errorMessage, requireEnvironment } from '../_shared/runtime.ts';

const reportCategories = new Set([
  'sexual_explicit',
  'harassment_threats',
  'hate_discrimination',
  'personal_data',
  'spam_fraud',
  'other',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);

  let body: { token?: unknown; category?: unknown };
  try {
    body = await request.json();
  } catch {
    return response({ error: 'invalid_request' }, 400);
  }

  if (typeof body.token !== 'string') return response({ error: 'invalid_action_token' }, 400);

  let payload: Awaited<ReturnType<typeof verifyLetterActionToken>>;
  try {
    payload = await verifyLetterActionToken(body.token, requireEnvironment('ALIAS_HMAC_SECRET'));
  } catch (error) {
    const code = errorMessage(error);
    return response({ error: code }, code === 'expired_action_token' ? 410 : 400);
  }

  const category = typeof body.category === 'string' ? body.category : null;
  if (payload.a === 'report' && (!category || !reportCategories.has(category))) {
    return response({ error: 'invalid_report_category' }, 400);
  }

  const { data, error } = await createAdminClient().rpc('apply_letter_action', {
    p_letter_id: payload.letterId,
    p_actor_id: payload.memberId,
    p_action: payload.a,
    p_category: payload.a === 'report' ? category : null,
  });
  if (error) {
    console.error('apply_letter_action failed', error);
    return response({ error: 'action_failed' }, 500);
  }

  const outcome = data?.[0];
  if (!outcome || outcome.result === 'letter_not_found' || outcome.result === 'not_recipient') {
    return response({ error: 'invalid_action_token' }, 400);
  }
  if (outcome.result !== 'stopped' && outcome.result !== 'reported') {
    return response({ error: 'action_failed' }, 500);
  }

  if (payload.a === 'report') kickTransactionalWorker();
  return response({ ok: true, action: payload.a, state: outcome.correspondence_status });
});

function kickTransactionalWorker() {
  const secret = Deno.env.get('WORKER_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!secret || !supabaseUrl) return;
  EdgeRuntime.waitUntil(fetch(`${supabaseUrl}/functions/v1/transactional-worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => undefined));
}
