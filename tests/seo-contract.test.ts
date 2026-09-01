import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import test from 'node:test';

const contentRoot = new URL('../src/content/journal/', import.meta.url);
const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
const notFoundPage = readFileSync(new URL('../src/pages/404.astro', import.meta.url), 'utf8');

const field = (source: string, name: string) =>
  source.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');

const articles = readdirSync(contentRoot, { withFileTypes: true }).flatMap((localeDirectory) => {
  if (!localeDirectory.isDirectory()) return [];
  const localeRoot = new URL(`${localeDirectory.name}/`, contentRoot);
  return readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const source = readFileSync(new URL(entry.name, localeRoot), 'utf8');
      return {
        file: join(localeDirectory.name, entry.name),
        fileSlug: basename(entry.name, '.md'),
        key: field(source, 'key'),
        locale: localeDirectory.name,
        slug: field(source, 'slug'),
      };
    });
});

const articlePath = (locale: string, slug: string) => `${locale === 'en' ? '' : `/${locale}`}/journal/${slug}/`;

test('every Journal entry has a stable translation key', () => {
  const missing = articles.filter(({ key }) => !key).map(({ file }) => file);
  assert.deepEqual(missing, []);
});

test('every historical Journal slug has a permanent redirect', () => {
  for (const article of articles) {
    assert.ok(article.slug && article.key, article.file);
    const target = articlePath(article.locale, article.slug);
    for (const legacySlug of new Set([article.key, article.fileSlug])) {
      const source = articlePath(article.locale, legacySlug);
      if (source === target) continue;
      assert.match(redirects, new RegExp(`^${encodeURI(source)} ${encodeURI(target)} 301$`, 'm'), article.file);
    }
  }
});

test('the custom not-found page is excluded from indexing', () => {
  assert.match(notFoundPage, /indexable=\{false\}/);
  assert.match(notFoundPage, /id="main-content"/);
});
