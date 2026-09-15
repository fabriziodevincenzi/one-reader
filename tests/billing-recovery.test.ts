import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inactiveSubscriptionFields } from '../supabase/functions/_shared/billing-state.ts';

test('cancellation removes all cached paid entitlement without deleting the member', () => {
  const fields = inactiveSubscriptionFields();
  assert.equal(fields.account_status, 'free');
  assert.equal(fields.plan, 'free');
  assert.equal(fields.subscription_status, 'canceled');
  assert.equal(fields.stripe_subscription_id, null);
  assert.equal(fields.subscription_current_period_end, null);
  assert.equal(fields.subscription_renews_at, null);
  assert.equal(fields.subscription_cancel_at_period_end, false);
  assert.equal('stripe_customer_id' in fields, false);
  assert.equal('id' in fields, false);
});

test('Stripe callback uses signed raw payload instead of Supabase gateway JWT', () => {
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');
  assert.match(config, /\[functions.stripe-webhook\][\s\S]*verify_jwt = false/);
  assert.match(source, /request.text\(\)/);
  assert.match(source, /constructEventAsync\(payload, signature/);
  assert.ok(source.indexOf('constructEventAsync') < source.indexOf("from('stripe_events').insert"));
  assert.match(source, /if \(previous.processed_at\)/);
  assert.match(source, /stripe.subscriptions.retrieve\(snapshot.id\)/);
});

test('no live subscription persists the free plan and cancels renewal notices', () => {
  const source = readFileSync(new URL('../supabase/functions/reconcile-billing/index.ts', import.meta.url), 'utf8');
  const branch = source.slice(source.indexOf('if (!subscription)'), source.indexOf('const accountStatus ='));
  assert.match(branch, /profile.account_status === 'founding'/);
  assert.match(branch, /inactiveSubscriptionFields\(\)/);
  assert.match(branch, /syncUpcomingRenewalEmail/);
  assert.match(branch, /reconciled: true/);
  assert.match(source, /autoPagingToArray/);
});
