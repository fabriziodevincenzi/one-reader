import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { recordAnalyticsEvent } from '../_shared/analytics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SignupPayload = {
  source?: 'waitlist' | 'signup';
  plan?: 'free' | 'annual';
  countryCode?: string | null;
  marketCurrency?: string | null;
  languageCode?: string | null;
  journalOptIn?: boolean;
  termsAccepted?: boolean;
  privacyAcknowledged?: boolean;
};

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: 'Function is not configured' }, 500);
  }

  // Validate the caller's JWT before using the service-role client. The
  // service-role client is kept inside this function and never reaches a page.
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return response({ error: 'Invalid authentication' }, 401);

  let payload: SignupPayload;
  try {
    payload = await request.json();
  } catch {
    return response({ error: 'Invalid request body' }, 400);
  }

  const user = userData.user;
  if (!user.email) return response({ error: 'A verified email address is required' }, 400);
  const source = payload.source === 'waitlist' ? 'waitlist' : 'signup';
  const requestedAnnual = payload.plan === 'annual';
  // The old waitlist link remains usable for legacy signups, but it no longer
  // creates a blocked account now that the service is open.
  const accountStatus = requestedAnnual ? 'checkout_pending' : 'free';
  const countryCode = typeof payload.countryCode === 'string' && /^[A-Z]{2}$/.test(payload.countryCode)
    ? payload.countryCode
    : null;
  const marketCurrency = typeof payload.marketCurrency === 'string' && /^[A-Z]{3}$/.test(payload.marketCurrency)
    ? payload.marketCurrency
    : null;
  const languageCode = typeof payload.languageCode === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(payload.languageCode)
    ? payload.languageCode
    : 'en';

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existingProfile, error: existingProfileError } = await admin
    .from('profiles')
    .select('account_status, plan')
    .eq('id', user.id)
    .maybeSingle();
  if (existingProfileError) return response({ error: existingProfileError.message }, 500);
  if (existingProfile?.account_status === 'closed') {
    return response({ error: 'This account is closed' }, 409);
  }
  let alreadyWaitlisted = false;
  if (source === 'waitlist') {
    const { data: existingWaitlistEntry, error: existingWaitlistError } = await admin
      .from('waitlist_entries')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingWaitlistError) return response({ error: existingWaitlistError.message }, 500);
    alreadyWaitlisted = existingWaitlistEntry?.status === 'active' || existingWaitlistEntry?.status === 'converted';
  }
  const protectedStatuses = new Set(['founding', 'annual', 'delivery_paused']);
  const nextStatus = existingProfile && protectedStatuses.has(existingProfile.account_status)
    ? existingProfile.account_status
    : accountStatus;
  const nextPlan = existingProfile?.plan === 'annual' || nextStatus === 'annual' ? 'annual' : 'free';

  const { error: profileError } = await admin.from('profiles').upsert({
    id: user.id,
    account_status: nextStatus,
    // Paid access is granted only by the payment webhook. Preserve existing
    // Writer access when a signed-in member completes the signup flow again.
    // A new annual intent remains checkout_pending until Stripe confirms it.
    plan: nextPlan,
    email_address: user.email.trim().toLowerCase(),
    waitlist_joined_at: source === 'waitlist' ? new Date().toISOString() : undefined,
    email_verified_at: user.email_confirmed_at ?? new Date().toISOString(),
    last_magic_link_redeemed_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (profileError) return response({ error: profileError.message }, 500);

  const { error: preferencesError } = await admin.from('member_preferences').upsert({
    user_id: user.id,
    country_code: countryCode,
    market_currency: marketCurrency,
    language_code: languageCode,
  }, { onConflict: 'user_id' });
  if (preferencesError) return response({ error: preferencesError.message }, 500);

  const { error: languageError } = await admin.from('member_languages').upsert({
    user_id: user.id,
    language_code: languageCode,
    willing_to_read: true,
    sort_order: 0,
  }, { onConflict: 'user_id,language_code' });
  if (languageError) return response({ error: languageError.message }, 500);

  const { error: statsError } = await admin.from('member_stats').upsert({
    user_id: user.id,
  }, { onConflict: 'user_id' });
  if (statsError) return response({ error: statsError.message }, 500);

  if (source === 'waitlist') {
    const { error } = await admin.from('waitlist_entries').upsert({
      user_id: user.id,
      source: 'landing',
      status: 'active',
    }, { onConflict: 'user_id' });
    if (error) return response({ error: error.message }, 500);
  }

  const consentVersion = '2026-08-09';
  const recordConsent = async (purpose: 'terms' | 'waitlist_operational' | 'journal_marketing' | 'privacy_acknowledgement', granted: boolean) => {
    const { data: existing, error: lookupError } = await admin
      .from('consent_events')
      .select('id')
      .eq('user_id', user.id)
      .eq('purpose', purpose)
      .eq('policy_version', consentVersion)
      .eq('granted', granted)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return;
    const consentText = purpose === 'terms'
      ? 'I have read and accept the Terms of Service.'
      : purpose === 'journal_marketing'
        ? 'I agree to receive occasional Journal notes and product news.'
        : purpose === 'privacy_acknowledgement'
          ? 'I acknowledge the One Reader Privacy Notice.'
          : 'I agree to receive the operational emails needed to manage my waitlist place.';
    const { error } = await admin.from('consent_events').insert({
      user_id: user.id,
      purpose,
      granted,
      policy_version: consentVersion,
      consent_text: consentText,
      source: source === 'waitlist' ? 'waitlist' : 'signup',
    });
    if (error) throw error;
  };

  try {
    if (source === 'waitlist') await recordConsent('waitlist_operational', true);
    if (payload.termsAccepted) await recordConsent('terms', true);
    if (payload.privacyAcknowledged) await recordConsent('privacy_acknowledgement', true);
    if (payload.journalOptIn) await recordConsent('journal_marketing', true);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Could not record consent' }, 500);
  }

  // Analytics is best-effort: a reporting outage must never block signup.
  try {
    await recordAnalyticsEvent(admin, 'signup_completed', {
      userId: user.id,
      source: source === 'waitlist' ? 'product' : 'direct',
      metadata: { plan: nextPlan, waitlist: source === 'waitlist' },
    });
  } catch (error) {
    console.warn('Could not record signup analytics event', error);
  }
  if (user.email_confirmed_at) {
    try {
      await recordAnalyticsEvent(admin, 'email_verified', { userId: user.id, source: 'product' });
    } catch (error) {
      console.warn('Could not record email verification analytics event', error);
    }
  }

  return response({ ok: true, status: nextStatus, alreadyWaitlisted });
});
