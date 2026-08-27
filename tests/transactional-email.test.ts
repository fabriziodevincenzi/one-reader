import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_LETTER_CHARACTERS, prepareLetterContent } from '../supabase/functions/_shared/email-content.ts';
import {
  renderTransactionalEmail,
  TRANSACTIONAL_EMAIL_EVENTS,
} from '../supabase/functions/_shared/transactional-email.ts';

test('every MVP transactional event renders complete HTML and plain text', () => {
  for (const eventType of TRANSACTIONAL_EMAIL_EVENTS) {
    const rendered = renderTransactionalEmail({
      eventType,
      siteUrl: 'https://onereader.co/',
      payload: {
        characterLimit: MAX_LETTER_CHARACTERS,
        nextAvailableAt: '2026-08-15T10:30:00.000Z',
        requestId: 'request-123',
        requestType: 'access',
        reportId: 'report-123',
        letterId: 'letter-123',
        correspondenceId: 'correspondence-123',
        reporterId: 'member-123',
        reporterEmail: 'reader@example.com',
        senderId: 'member-456',
        category: 'harassment_threats',
        renewalAt: '2027-08-15T10:30:00.000Z',
        cancellationDeadlineAt: '2027-08-15T10:30:00.000Z',
        currency: 'eur',
        unitAmount: 1800,
      },
    });
    assert.ok(rendered.subject.length > 5, eventType);
    assert.match(rendered.html, /One Reader/);
    assert.match(rendered.text, /One Reader/);
    assert.doesNotMatch(rendered.html, /undefined|null/);
    assert.doesNotMatch(rendered.text, /undefined|null/);
  }
});

test('service emails use the minimal shared shell', () => {
  const rendered = renderTransactionalEmail({ eventType: 'opening_delivered' });
  assert.match(rendered.html, /max-width:620px/);
  assert.match(rendered.html, /background:#ffffff/);
  assert.doesNotMatch(rendered.html, /background:#e9e2d6|box-shadow|A practical note/);
  assert.doesNotMatch(rendered.html, /font-size:3[4-9]px/);
});

test('renewal notice states charge, date and cancellation path', () => {
  const rendered = renderTransactionalEmail({
    eventType: 'renewal_upcoming',
    payload: {
      renewalAt: '2027-08-15T10:30:00.000Z',
      cancellationDeadlineAt: '2027-08-14T10:30:00.000Z',
      currency: 'eur',
      unitAmount: 1800,
    },
  });
  assert.match(rendered.subject, /15 August 2027/);
  assert.match(rendered.text, /€18\.00/);
  assert.match(rendered.text, /renew automatically/i);
  assert.match(rendered.text, /cancel before 14 August 2027/i);
  assert.match(rendered.text, /Manage or cancel membership/);
});

test('unknown senders are told that consent was not inferred', () => {
  const rendered = renderTransactionalEmail({ eventType: 'unknown_sender' });
  assert.match(rendered.text, /did not create an account/i);
  assert.match(rendered.text, /did not keep or forward/i);
  assert.match(rendered.text, /Register explicitly/i);
});

test('Free members can keep receiving and replying after the first opening', () => {
  const rendered = renderTransactionalEmail({
    eventType: 'cadence_limited_free',
    payload: { membershipRequired: true },
  });
  assert.match(rendered.subject, /first letter/i);
  assert.match(rendered.text, /receive letters and reply/i);
  assert.match(rendered.text, /annual membership/i);
});

test('daily cadence has no upgrade prompt', () => {
  const rendered = renderTransactionalEmail({
    eventType: 'cadence_limited_daily',
    payload: { nextAvailableAt: '2026-08-15T09:45:00.000Z' },
  });
  assert.match(rendered.text, /15 August 2026/);
  assert.doesNotMatch(rendered.text, /upgrade|annual membership/i);
});

test('transactional payload values are escaped in HTML', () => {
  const rendered = renderTransactionalEmail({
    eventType: 'privacy_request_received',
    payload: { requestId: '<img src=x onerror=alert(1)>', requestType: 'access' },
  });
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.match(rendered.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('letter report notifications identify the report without including letter content', () => {
  const rendered = renderTransactionalEmail({
    eventType: 'letter_report_received',
    payload: {
      reportId: 'report-123',
      letterId: 'letter-123',
      correspondenceId: 'correspondence-123',
      reporterId: 'member-123',
      reporterEmail: 'reader@example.com',
      senderId: 'member-456',
      category: 'harassment_threats',
    },
  });
  assert.match(rendered.subject, /letter report/i);
  assert.match(rendered.text, /harassment or threats/i);
  assert.match(rendered.text, /reader@example\.com/);
  assert.match(rendered.text, /letter-123/);
  assert.match(rendered.text, /remains encrypted/i);
});

test('over-limit letters are detected without silently accepting the shortened text', () => {
  const prepared = prepareLetterContent({ text: 'a'.repeat(MAX_LETTER_CHARACTERS + 1) });
  assert.equal(prepared.truncated, true);
  assert.equal(prepared.text.length, MAX_LETTER_CHARACTERS);
});
