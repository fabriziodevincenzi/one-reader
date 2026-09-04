import type { APIRoute } from 'astro';
import { getJournalEntries, getJournalDate, getJournalSlug } from '../../lib/journal';

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = (site ?? new URL('https://onereader.co')).toString().replace(/\/$/, '');
  const items = (await getJournalEntries('en'))
    .map(
      (article) => `
    <item>
      <title><![CDATA[${article.data.title}]]></title>
      <description><![CDATA[${article.data['meta-description']}]]></description>
      <link>${baseUrl}/journal/${getJournalSlug(article)}/</link>
      <guid>${baseUrl}/journal/${getJournalSlug(article)}/</guid>
      <pubDate>${new Date(`${getJournalDate(article)}T00:00:00Z`).toUTCString()}</pubDate>
    </item>`,
    )
    .join('');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>One Reader Journal</title>
    <description>Notes on pen pals, writing to strangers, paying attention, and finding a way to begin.</description>
    <link>${baseUrl}/journal/</link>
    <language>en</language>${items}
  </channel>
</rss>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
