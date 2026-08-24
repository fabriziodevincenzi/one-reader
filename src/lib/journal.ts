import { getCollection, type CollectionEntry } from 'astro:content';
import type { SiteLocale } from './i18n';

export type JournalEntry = CollectionEntry<'journal'>;

export const getJournalLocale = (entry: JournalEntry): SiteLocale => {
  const locale = entry.data.lang || entry.id.split('/')[0];
  return locale as SiteLocale;
};

export const getJournalKey = (entry: JournalEntry) => entry.data.key ?? entry.id.split('/').pop()?.replace(/\.md$/, '') ?? entry.id;

export const getJournalSlug = (entry: JournalEntry) => entry.data.slug;

export const getJournalDate = (entry: JournalEntry) => entry.data.publishedAt ?? '2026-08-15';

export async function getJournalEntries(locale?: SiteLocale) {
  const entries = await getCollection('journal', (entry) => !locale || getJournalLocale(entry) === locale);
  return entries.sort((a, b) => getJournalDate(b).localeCompare(getJournalDate(a)));
}

export const formatJournalDate = (date: string, locale = 'en') =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T00:00:00Z`),
  );
