import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ensureMemberProfile } from '../src/lib/ensure-member-profile.ts';

const session = {
  access_token: 'test-session',
  user: { id: 'member-1', email_confirmed_at: '2026-09-14T19:40:49Z', user_metadata: {
    source: 'signup', plan_intent: 'free', terms_accepted: true,
    privacy_acknowledged: true, language_code: 'it', journal_opt_in: false,
  } },
} as unknown as Session;

function fixture(options: { exists?: boolean; readError?: boolean; invokeError?: boolean; noProfileCreated?: boolean } = {}) {
  let exists = options.exists ?? false;
  const invocations: Array<{ name: string; args: any }> = [];
  const client = {
    from(name: string) {
      assert.equal(name, 'profiles');
      return { select: () => ({ eq: (field: string, id: string) => {
        assert.equal(field, 'id');
        assert.equal(id, session.user.id);
        return { maybeSingle: async () => ({ data: exists ? { id } : null, error: options.readError ? new Error('offline') : null }) };
      } }) };
    },
    functions: { invoke: async (name: string, args: unknown) => {
      invocations.push({ name, args });
      if (!options.invokeError && !options.noProfileCreated) exists = true;
      return { error: options.invokeError ? new Error('unavailable') : null };
    } },
  } as unknown as SupabaseClient;
  return { client, invocations };
}

test('verified signup reaching member via sign-in recovers its missing profile', async () => {
  const { client, invocations } = fixture();
  await ensureMemberProfile(client, session);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].name, 'complete-signup');
  assert.deepEqual(invocations[0].args.body, {
    source: 'signup', plan: 'free', countryCode: null, languageCode: 'it',
    termsAccepted: true, privacyAcknowledged: true, journalOptIn: false,
  });
  assert.equal(invocations[0].args.headers.Authorization, 'Bearer test-session');
  await ensureMemberProfile(client, session);
  assert.equal(invocations.length, 1, 'subsequent visits must not replay signup');
});

test('existing members do not replay signup or reset preferences', async () => {
  const { client, invocations } = fixture({ exists: true });
  await ensureMemberProfile(client, session);
  assert.equal(invocations.length, 0);
});

test('read failures are not mistaken for missing profiles', async () => {
  const { client, invocations } = fixture({ readError: true });
  await assert.rejects(ensureMemberProfile(client, session), /check account setup/);
  assert.equal(invocations.length, 0);
});

test('missing consent or verification never silently completes registration', async () => {
  for (const user of [
    { ...session.user, email_confirmed_at: undefined },
    { ...session.user, user_metadata: { ...session.user.user_metadata, terms_accepted: false } },
    { ...session.user, user_metadata: {} },
  ]) {
    const { client, invocations } = fixture();
    await assert.rejects(ensureMemberProfile(client, { ...session, user }), /incomplete/);
    assert.equal(invocations.length, 0);
  }
});

test('setup failure prevents opening the editable account', async () => {
  const { client } = fixture({ invokeError: true });
  await assert.rejects(ensureMemberProfile(client, session), /could not finish/);
});

test('successful invocation still requires a readable profile', async () => {
  const { client } = fixture({ noProfileCreated: true });
  await assert.rejects(ensureMemberProfile(client, session), /not ready/);
});
