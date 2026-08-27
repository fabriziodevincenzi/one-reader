import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { createAdminClient, errorMessage, jsonResponse, requireEnvironment } from '../_shared/runtime.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supportedPriceCurrencies = new Set([
  'EUR', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'DKK', 'GBP', 'ILS',
  'ISK', 'JPY', 'KRW', 'NOK', 'PLN', 'SEK', 'TWD', 'UAH', 'USD',
]);

const defaultStripePriceIds = {
  annual: 'price_1U91xaBA5ijGzHgS2riHa649',
  monthly: 'price_1U91lyBA5ijGzHgSY5vBt5UV',
} as const;

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return response({ error: 'Authentication required' }, 401);

    const authClient = createClient(requireEnvironment('SUPABASE_URL'), requireEnvironment('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user?.email) return response({ error: 'Invalid authentication' }, 401);

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, email_address, account_status, plan, stripe_customer_id')
      .eq('id', userData.user.id)
      .single();
    if (profileError) throw profileError;
    if (profile.account_status === 'closed') return response({ error: 'This account is closed' }, 409);
    if (profile.plan === 'annual' || profile.account_status === 'annual') return response({ error: 'Writer is already active' }, 409);

    const preferences = await admin.from('member_preferences').select('country_code, market_currency').eq('user_id', userData.user.id).maybeSingle();
    if (preferences.error) throw preferences.error;
    const body = await request.json().catch(() => ({}));
    const requestedCurrency = typeof body.currency === 'string' ? body.currency.toUpperCase() : null;
    const billingPeriod = body.billingPeriod === 'monthly' ? 'monthly' : 'annual';
    const preferredCurrency = requestedCurrency || preferences.data?.market_currency || 'EUR';
    const currency = supportedPriceCurrencies.has(preferredCurrency) ? preferredCurrency : 'EUR';
    // Price IDs are public identifiers. This Price contains all supported
    // currency_options; the optional environment value allows future swaps
    // without a code deployment.
    const priceId = (billingPeriod === 'monthly'
      ? Deno.env.get('STRIPE_WRITER_PRICE_MONTHLY')?.trim()
      : Deno.env.get('STRIPE_WRITER_PRICE_ANNUAL')?.trim())
      || defaultStripePriceIds[billingPeriod];

    const stripe = new Stripe(requireEnvironment('STRIPE_SECRET_KEY'), { apiVersion: '2025-03-31.basil' });
    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email_address || userData.user.email,
        metadata: { supabase_user_id: userData.user.id },
      });
      customerId = customer.id;
      const { error } = await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userData.user.id);
      if (error) throw error;
    }

    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://onereader.co').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      currency: currency.toLowerCase() as Stripe.Checkout.SessionCreateParams.Currency,
      customer: customerId,
      client_reference_id: userData.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_types: ['card'],
      allow_promotion_codes: false,
      success_url: `${siteUrl}/member/?stripe=success`,
      cancel_url: `${siteUrl}/member/?stripe=cancelled`,
      billing_address_collection: 'auto',
      automatic_tax: { enabled: Deno.env.get('STRIPE_AUTOMATIC_TAX') === 'true' },
      metadata: { supabase_user_id: userData.user.id, currency, billing_period: billingPeriod },
      subscription_data: { metadata: { supabase_user_id: userData.user.id, currency, billing_period: billingPeriod } },
    });

    const { error: pendingError } = await admin.from('profiles').update({ account_status: 'checkout_pending' }).eq('id', userData.user.id).eq('plan', 'free');
    if (pendingError) throw pendingError;
    return response({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout failed', error);
    return response({ error: errorMessage(error) }, 400);
  }
});
