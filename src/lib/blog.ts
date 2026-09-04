import type { SiteLocale } from './i18n';

export interface BlogArticle {
  slug: string;
  title: string;
  subtitle: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  language: SiteLocale;
  readingTime: string;
  paragraphs: string[];
  image?: string;
  imageAlt?: string;
}

export const blogArticles: BlogArticle[] = [
  {
    slug: 'what-an-inbox-can-still-be-for',
    title: 'What an inbox can still be for',
    subtitle: 'A note on the quiet possibilities of a pen-pal email that has no commercial reason to exist.',
    publishedAt: '2026-08-08',
    author: 'One Reader',
    language: 'en',
    readingTime: '3 min read',
    paragraphs: [
      'Most messages arrive with a job to do. They ask us to buy, confirm, renew, click, or keep up. Over time, the inbox starts to feel less like a place where people meet and more like a place where obligations wait.',
      'One Reader begins with a smaller possibility: one person writes to one possible pen pal they do not know, and the message asks for nothing beyond a little attention. There is no profile to maintain and no public reaction to collect.',
      'The letter may receive a reply. It may receive a simple sign that it was read. It may end there. None of those outcomes needs to become a score for the person who wrote or the person who received it.',
      'We are building the service around that restraint: private aliases, careful delivery, a slow cadence, and enough room for the people involved to decide what happens next.',
    ],
  },
];

export const getArticle = (slug: string) => blogArticles.find((article) => article.slug === slug);

export const formatArticleDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`));
