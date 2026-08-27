export const waitlistConfig = {
  goal: 100,
  publicThreshold: 10,
  count: parsePublicCount(import.meta.env.PUBLIC_WAITLIST_COUNT),
};

// One Reader is now open to everyone. Keep the waitlist configuration around
// for legacy data and reporting, but never gate account creation on it.
export const serviceIsOpen = (_count = waitlistConfig.count) => true;

export const launchCurrencies = [
  'EUR',
  'USD',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'SGD',
  'HKD',
  'INR',
  'PLN',
  'BRL',
] as const;

export const plannedCurrencies = [
  ...launchCurrencies,
  'DKK',
  'ISK',
  'NOK',
  'SEK',
  'JPY',
  'CNY',
  'CHF',
  'TWD',
  'KRW',
  'UAH',
  'ILS',
] as const;

export const excludedFirstPhaseMarkets = ['CN'] as const;

export const priceGrid = {
  EUR: { full: 18, monthly: 2 }, USD: { full: 21, monthly: 2.5 }, GBP: { full: 18, monthly: 2 },
  CAD: { full: 29, monthly: 3.5 }, AUD: { full: 29.5, monthly: 3.5 }, CHF: { full: 18, monthly: 2 },
  DKK: { full: 145, monthly: 19 }, NOK: { full: 245, monthly: 29 }, SEK: { full: 245, monthly: 29 },
  ISK: { full: 2600, monthly: 300 }, PLN: { full: 60, monthly: 7 }, JPY: { full: 3280, monthly: 380 },
  CNY: { full: 140, monthly: 16 }, TWD: { full: 669, monthly: 75 }, KRW: { full: 3000, monthly: 350 },
  UAH: { full: 800, monthly: 90 }, ILS: { full: 65, monthly: 7 }, BRL: { full: 30, monthly: 3.5 },
} as const;

export const stripePriceIds = {
  annual: 'price_1U91xaBA5ijGzHgS2riHa649',
  monthly: 'price_1U91lyBA5ijGzHgSY5vBt5UV',
} as const;

export type PriceCurrency = keyof typeof priceGrid;

export const aliasInactiveAfterDays = 30;

export const fullAnnualPrice = {
  amount: 18,
  currency: 'EUR',
  label: '€18 / year',
} as const;

export function waitlistCountIsPublic(count = waitlistConfig.count) {
  return count >= waitlistConfig.publicThreshold;
}

function parsePublicCount(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
