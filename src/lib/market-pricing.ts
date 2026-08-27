import { priceGrid, type PriceCurrency } from './product-config';

const euroCountries = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];

export const currencyByCountry: Record<string, string> = Object.fromEntries([
  ...euroCountries.map((country) => [country, 'EUR']),
  ['US', 'USD'],
  ['GB', 'GBP'],
  ['CA', 'CAD'],
  ['AU', 'AUD'],
  ['NZ', 'NZD'],
  ['DK', 'DKK'],
  ['IS', 'ISK'],
  ['NO', 'NOK'],
  ['SE', 'SEK'],
  ['JP', 'JPY'],
  ['CH', 'CHF'],
  ['TW', 'TWD'],
  ['KR', 'KRW'],
  ['UA', 'UAH'],
  ['IL', 'ILS'],
  ['SG', 'SGD'],
  ['HK', 'HKD'],
  ['PL', 'PLN'],
  ['IN', 'INR'],
  ['BR', 'BRL'],
]);

export const fallbackMarket = {
  currency: 'EUR' as PriceCurrency,
  amount: priceGrid.EUR.full,
  fallback: true,
};

export function marketForCountry(country?: string) {
  const requestedCurrency = country ? currencyByCountry[country.toUpperCase()] : undefined;
  const currency = requestedCurrency && requestedCurrency in priceGrid ? requestedCurrency as PriceCurrency : fallbackMarket.currency;
  return {
    currency,
    amount: priceGrid[currency].full,
    fallback: !requestedCurrency || !(requestedCurrency in priceGrid),
  };
}

export function formatAnnualPrice(amount: number, currency: string, locale = 'en') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'AUD' ? 2 : 0,
  }).format(amount);
}
