import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const accountPage = readFileSync(new URL('../src/pages/member/index.astro', import.meta.url), 'utf8');
const globalStyles = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const socialCard = readFileSync(new URL('../src/pages/og/[slug].png.ts', import.meta.url), 'utf8');
const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));

const filesBelow = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? filesBelow(path) : [path];
});

const astroSources = filesBelow(sourceRoot)
  .filter((path) => path.endsWith('.astro'))
  .map((path) => ({ path, content: readFileSync(path, 'utf8') }));

test('the account page keeps product hierarchy in the interface face', () => {
  assert.doesNotMatch(accountPage, /font-serif/);
  assert.match(accountPage, /class="brand-logo no-underline"/);
  assert.match(accountPage, /class="account-interface[^\"]*" data-membership-label/);
  assert.match(globalStyles, /\.account-page h2,[\s\S]*font-family: var\(--font-interface\)/);
});

test('account editorial copy is opted into the letter face explicitly', () => {
  assert.match(accountPage, /account-prose/);
  assert.match(globalStyles, /\.account-page \.account-prose \{\s*font-family: var\(--font-letter\)/);
  assert.doesNotMatch(globalStyles, /\.account-page p:not\(/);
});

test('product headings never opt into the letter face', () => {
  const offenders = astroSources
    .filter(({ content }) => /<h[1-3]\b[^>]*class="[^"]*\bfont-serif\b[^"]*"/i.test(content))
    .map(({ path }) => path.replace(`${sourceRoot}/`, ''));
  assert.deepEqual(offenders, []);
});

test('identity styles contain no active legacy font or decorative effects', () => {
  assert.doesNotMatch(globalStyles, /DM Sans|DM Mono|Libre Baskerville/);
  assert.doesNotMatch(globalStyles, /linear-gradient|box-shadow/);
  assert.match(globalStyles, /\.writer-card \{\s*background: var\(--surface\)/);
});

test('journal social cards use the current typography and palette', () => {
  assert.match(socialCard, /font: 700 32px "IBM Plex Mono"/);
  assert.match(socialCard, /fill="#ffffff"/);
  assert.match(socialCard, /fill:#26344e/);
  assert.doesNotMatch(socialCard, /Iowan Old Style|Palatino|#f3eee4|#b2523a/);
});

test('every wordmark link uses the canonical class', () => {
  for (const { path, content } of astroSources) {
    const links = content.match(/<a\b[^>]*aria-label="One Reader, home"[^>]*>/g) ?? [];
    for (const link of links) {
      assert.match(link, /class="[^"]*\bbrand-logo\b/, path);
    }
  }
});

test('every rendered main landmark supports the shared skip link', () => {
  for (const { path, content } of astroSources) {
    const mains = content.match(/<main\b[^>]*>/g) ?? [];
    for (const main of mains) {
      assert.match(main, /id="main-content"/, path);
    }
  }
});
