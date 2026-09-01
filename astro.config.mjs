import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { readFileSync, readdirSync } from 'node:fs';
import { siteLocales } from './src/lib/i18n';

const journalContentUrl = new URL('./src/content/journal/', import.meta.url);

const readFrontmatterField = (source, field) => {
  const value = source.match(new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.trim();
  return value?.replace(/^(['"])(.*)\1$/, '$2');
};

const journalRedirectPaths = new Set(
  readdirSync(journalContentUrl, { withFileTypes: true }).flatMap((localeDirectory) => {
    if (!localeDirectory.isDirectory()) return [];
    const localeUrl = new URL(`${localeDirectory.name}/`, journalContentUrl);

    return readdirSync(localeUrl, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith('.md')) return [];
      const source = readFileSync(new URL(entry.name, localeUrl), 'utf8');
      const slug = readFrontmatterField(source, 'slug');
      const translationKey = readFrontmatterField(source, 'key');
      const fileSlug = entry.name.replace(/\.md$/, '');
      if (!slug) return [];
      const localePrefix = localeDirectory.name === 'en' ? '' : `/${localeDirectory.name}`;
      return [...new Set([translationKey, fileSlug])]
        .filter((legacySlug) => legacySlug && legacySlug !== slug)
        .map((legacySlug) => `${localePrefix}/journal/${legacySlug}/`);
    });
  }),
);

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://onereader.co',
  output: 'static',
  compressHTML: true,
  i18n: {
    defaultLocale: 'en',
    locales: siteLocales,
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      // Only public, indexable content belongs in the sitemap. Legacy blog
      // and Journal URLs redirect, while these routes are functional or
      // intended for authenticated/email flows.
      filter: (page) => {
        const pathname = new URL(page).pathname;
        const isPrivateOrFunctional = ['/404', '/blog', '/email', '/member', '/sign-in', '/welcome'].some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
        );
        const isLegacyRedirect = journalRedirectPaths.has(decodeURI(pathname));
        return !isPrivateOrFunctional && !isLegacyRedirect;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
