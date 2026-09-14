import type { Session, SupabaseClient } from '@supabase/supabase-js';

/** Recover a verified signup independently of the email's redirect destination. */
export async function ensureMemberProfile(client: SupabaseClient, session: Session): Promise<void> {
  const readProfile = () => client.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
  const existing = await readProfile();
  if (existing.error) throw new Error('Could not check account setup. Please reload to try again.');
  // Never replay signup for an existing member: it can reset their preferences.
  if (existing.data) return;

  const metadata = session.user.user_metadata ?? {};
  if (!session.user.email_confirmed_at || metadata.source !== 'signup'
    || !['free', 'annual'].includes(metadata.plan_intent)
    || metadata.terms_accepted !== true || metadata.privacy_acknowledged !== true) {
    throw new Error('Your account setup is incomplete. Please return to the home page and complete registration.');
  }

  // Use this authenticated user's saved signup intent, not another account's localStorage.
  // These fields express signup preferences, never authorization or paid entitlement.
  const { error } = await client.functions.invoke('complete-signup', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: {
      source: 'signup',
      plan: metadata.plan_intent,
      countryCode: metadata.market_country ?? null,
      languageCode: metadata.language_code ?? 'en',
      termsAccepted: true,
      privacyAcknowledged: true,
      journalOptIn: metadata.journal_opt_in === true,
    },
  });
  if (error) throw new Error('Your email is verified, but account setup could not finish. Please reload to try again.');
  const saved = await readProfile();
  if (saved.error || !saved.data) throw new Error('Your account is not ready yet. Please reload to try again.');
}
