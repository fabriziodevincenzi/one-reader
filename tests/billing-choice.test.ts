import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const accountPage = readFileSync(new URL('../src/pages/member/index.astro', import.meta.url), 'utf8');
const checkoutFunction = readFileSync(new URL('../supabase/functions/create-checkout/index.ts', import.meta.url), 'utf8');

test('the account page exposes both Writer billing periods before checkout', () => {
  assert.match(accountPage, /data-billing-period="monthly"/);
  assert.match(accountPage, /data-billing-period="annual"/);
  assert.match(accountPage, /data-monthly-price/);
  assert.match(accountPage, /data-annual-price/);
  assert.match(accountPage, /billingChoice\?\.classList\.remove\('hidden'\)/);
});

test('checkout receives the billing period selected in the account page', () => {
  assert.match(accountPage, /billingPeriod: selectedBillingPeriod/);
  assert.match(accountPage, /localStorage\.setItem\(billingStorageKey, selectedBillingPeriod\)/);
  assert.doesNotMatch(accountPage, /localStorage\.removeItem\('one-reader:billing-period'\)/);
  assert.match(checkoutFunction, /body\.billingPeriod === 'monthly' \? 'monthly' : 'annual'/);
  assert.match(checkoutFunction, /defaultStripePriceIds\[billingPeriod\]/);
});
