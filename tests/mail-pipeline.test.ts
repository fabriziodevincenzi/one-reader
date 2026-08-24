import assert from 'node:assert/strict';
import test from 'node:test';
import {
  htmlToPlainText,
  isAutomatedMessage,
  prepareLetterContent,
  senderAuthenticationPassed,
} from '../supabase/functions/_shared/email-content.ts';
import { createLetterActionToken, verifyLetterActionToken } from '../supabase/functions/_shared/action-token.ts';
import { decryptLetter, deriveAliasToken, encryptLetter, hashAliasToken } from '../supabase/functions/_shared/crypto.ts';
import { renderLetterEmail } from '../supabase/functions/_shared/email-template.ts';

test('prepares plain text without quoted replies or signatures', () => {
  const prepared = prepareLetterContent({
    text: 'Dear someone,\n\nA quiet morning.\n\nOn Thu, Someone wrote:\n> an older letter',
  });
  assert.equal(prepared.text, 'Dear someone,\n\nA quiet morning.');
  assert.equal(prepared.truncated, false);
});

test('turns HTML into readable text and removes executable content', () => {
  const text = htmlToPlainText('<p>Hello &amp; welcome.</p><script>alert(1)</script><p>Second line.</p>');
  assert.match(text, /Hello & welcome/);
  assert.match(text, /Second line/);
  assert.doesNotMatch(text, /alert/);
});

test('detects automatic messages and authenticated human mail', () => {
  assert.equal(isAutomatedMessage({ 'Auto-Submitted': 'auto-replied' }, 'person@example.com'), true);
  assert.equal(isAutomatedMessage({}, 'person@example.com'), false);
  assert.equal(senderAuthenticationPassed({ 'Authentication-Results': 'mx; dmarc=pass header.from=example.com' }), true);
  assert.equal(senderAuthenticationPassed({ 'Authentication-Results': 'mx; dkim=fail' }), false);
});

test('escapes member content in the outbound HTML template', () => {
  const rendered = renderLetterEmail({
    body: '<img src=x onerror=alert(1)>\n\nStill words.',
    subject: 'A letter for you',
    isReply: false,
    attachmentsRemoved: true,
    stopUrl: 'https://onereader.co/email/action/stop/?token=private-stop-token',
    reportUrl: 'https://onereader.co/email/action/report/?token=private-report-token',
  });
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.match(rendered.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(rendered.text, /Attachments were removed/);
  assert.match(rendered.html, /End this correspondence/);
  assert.match(rendered.text, /Report this message/);
  assert.doesNotMatch(rendered.html, /<h1/);
  assert.doesNotMatch(rendered.text, /^A letter for you/);
  assert.match(rendered.html, /max-width:560px/);
});

test('signs letter actions and rejects tampered or expired tokens', async () => {
  const secret = 'a sufficiently long action-token secret for tests';
  const letterId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const token = await createLetterActionToken({
    secret,
    action: 'report',
    letterId,
    memberId,
    expiresAt: new Date('2030-01-01T00:00:00Z'),
  });
  const payload = await verifyLetterActionToken(token, secret, new Date('2029-01-01T00:00:00Z'));
  assert.deepEqual(
    { action: payload.a, letterId: payload.letterId, memberId: payload.memberId },
    { action: 'report', letterId, memberId },
  );

  const finalCharacter = token.at(-1) === 'a' ? 'b' : 'a';
  await assert.rejects(
    verifyLetterActionToken(`${token.slice(0, -1)}${finalCharacter}`, secret, new Date('2029-01-01T00:00:00Z')),
    /invalid_action_token/,
  );
  await assert.rejects(
    verifyLetterActionToken(token, secret, new Date('2030-01-02T00:00:00Z')),
    /expired_action_token/,
  );
});

test('derives stable directional aliases and envelope-encrypts letter content', async () => {
  const secret = 'a sufficiently long alias secret for the test';
  const tokenA = await deriveAliasToken(secret, 'conversation-1', 'member-a');
  const tokenARepeat = await deriveAliasToken(secret, 'conversation-1', 'member-a');
  const tokenB = await deriveAliasToken(secret, 'conversation-1', 'member-b');
  assert.equal(tokenA, tokenARepeat);
  assert.notEqual(tokenA, tokenB);
  assert.match(await hashAliasToken(tokenA), /^[a-f0-9]{64}$/);

  const keyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const kek = Buffer.from(keyBytes).toString('base64');
  const encrypted = await encryptLetter('Only these words travel.', kek);
  assert.doesNotMatch(encrypted.ciphertext, /Only these words/);
  assert.equal(await decryptLetter(encrypted, kek), 'Only these words travel.');
});
