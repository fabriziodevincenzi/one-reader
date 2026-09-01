import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderLetterEmail } from '../supabase/functions/_shared/email-template.ts';
import { renderTransactionalEmail } from '../supabase/functions/_shared/transactional-email.ts';

const AUTH_TEMPLATES = [
  'confirmation.html',
  'email-change.html',
  'email-changed-notification.html',
  'magic-link.html',
] as const;

const BRAND_MARKERS = [
  'background:#ffffff',
  'color:#1a1a18',
  'max-width:620px',
  'IBM Plex Mono',
  'SFMono-Regular',
  'Courier New',
  'font-size:16px;font-weight:700;line-height:1.2;letter-spacing:.02em',
] as const;

const LEGACY_MARKERS = [
  'background:#faf7f0',
  'color:#211f1b',
  'Segoe UI',
  'max-width:560px',
] as const;

test('Supabase Auth and Resend emails use the same One Reader shell', async () => {
  const templatesDirectory = fileURLToPath(new URL('../supabase/templates/', import.meta.url));
  const authTemplates = await Promise.all(
    AUTH_TEMPLATES.map((name) => readFile(`${templatesDirectory}${name}`, 'utf8')),
  );
  const serviceEmail = renderTransactionalEmail({ eventType: 'privacy_request_received' }).html;
  const letterEmail = renderLetterEmail({
    body: 'A letter written for one reader.',
    subject: 'A letter for you',
    isReply: false,
    attachmentsRemoved: false,
    stopUrl: 'https://onereader.co/email/action/stop/',
    reportUrl: 'https://onereader.co/email/action/report/',
  }).html;

  for (const [source, html] of [
    ...AUTH_TEMPLATES.map((name, index) => [`Supabase Auth: ${name}`, authTemplates[index]] as const),
    ['Resend: service email', serviceEmail] as const,
    ['Resend: letter email', letterEmail] as const,
  ]) {
    for (const marker of BRAND_MARKERS) {
      assert.ok(html.includes(marker), `${source} is missing brand marker: ${marker}`);
    }
    for (const marker of LEGACY_MARKERS) {
      assert.ok(!html.includes(marker), `${source} still contains legacy styling: ${marker}`);
    }
  }
});
