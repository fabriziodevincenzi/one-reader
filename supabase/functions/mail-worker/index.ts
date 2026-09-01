import { Resend } from 'npm:resend@6.18.1';
import { franc } from 'npm:franc@6.2.0';
import { createLetterActionToken } from '../_shared/action-token.ts';
import { deriveAliasToken, encryptLetter, hashAliasToken } from '../_shared/crypto.ts';
import {
  isAutomatedMessage,
  MAX_LETTER_CHARACTERS,
  normalizeEmailAddress,
  prepareLetterContent,
  senderAuthenticationPassed,
} from '../_shared/email-content.ts';
import { renderLetterEmail } from '../_shared/email-template.ts';
import { createAdminClient, errorMessage, jsonResponse, requireEnvironment } from '../_shared/runtime.ts';
import {
  enqueueTransactionalEmail,
  type EnqueueTransactionalEmailInput,
} from '../_shared/transactional-outbox.ts';
import { detectLetterLanguage } from '../_shared/language-detection.ts';

type MailJob = {
  id: number;
  attempts: number;
  provider_event_id: string;
  payload: { provider_email_id?: string };
};

type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  received_for?: string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  message_id?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  attachments?: Array<{ id: string }>;
};

type ExistingLetter = {
  id: string;
  correspondence_id: string;
  sender_id: string;
  recipient_id: string;
  kind: 'opening' | 'reply';
  state: string;
  provider_outbound_id: string | null;
  attachment_count: number;
};

type SenderProfile = {
  id: string;
  account_status: string;
  plan: 'free' | 'annual';
  email_address: string;
  email_verified_at: string | null;
  service_eligible_at: string | null;
  adult_pool_eligible_at: string | null;
};

class JobOutcome extends Error {
  constructor(
    message: string,
    readonly disposition: 'complete' | 'retry',
    readonly retryAfterSeconds = 60,
  ) {
    super(message);
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!authorized(request)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc('claim_mail_jobs', { p_limit: 5 });
  if (error) return jsonResponse({ error: error.message }, 500);

  let completed = 0;
  let retried = 0;
  for (const job of (jobs ?? []) as MailJob[]) {
    try {
      await processInbound(job);
      await completeJob(job);
      completed += 1;
    } catch (error) {
      const outcome = error instanceof JobOutcome
        ? error
        : new JobOutcome(errorMessage(error), 'retry', retryDelay(job.attempts));
      if (outcome.disposition === 'complete') {
        await completeJob(job, outcome.message, true);
        completed += 1;
      } else {
        if (job.attempts >= 8) await enqueueTerminalFailure(job).catch(console.error);
        await retryJob(job, outcome.message, outcome.retryAfterSeconds);
        retried += 1;
      }
    }
  }

  if ((jobs?.length ?? 0) > 0) kickTransactionalWorker();

  return jsonResponse({ ok: true, claimed: jobs?.length ?? 0, completed, retried });
});

async function processInbound(job: MailJob) {
  const providerEmailId = job.payload.provider_email_id;
  if (!providerEmailId) throw new JobOutcome('Queue item has no provider email id', 'complete');

  const admin = createAdminClient();
  const resend = new Resend(requireEnvironment('RESEND_API_KEY'));
  const { data, error } = await resend.emails.receiving.get(providerEmailId);
  if (error || !data) throw new Error(error?.message ?? 'Could not retrieve the received email');
  const email = data as ReceivedEmail;
  const senderEmail = normalizeEmailAddress(email.from);
  const headers = email.headers ?? {};

  if (isAutomatedMessage(headers, senderEmail)) {
    throw new JobOutcome('Automated message ignored', 'complete');
  }
  if (Deno.env.get('REQUIRE_EMAIL_AUTHENTICATION') !== 'false' && !senderAuthenticationPassed(headers)) {
    throw new JobOutcome('Sender authentication did not pass DKIM or DMARC', 'complete');
  }

  const route = inboundRoute(email);

  const { data: sender, error: senderError } = await admin
    .from('profiles')
    .select('id, account_status, plan, email_address, email_verified_at, service_eligible_at, adult_pool_eligible_at')
    .eq('email_address', senderEmail)
    .maybeSingle();
  if (senderError) throw senderError;
  if (!sender) {
    if (route.kind === 'reply') {
      throw new JobOutcome('Reply sender is not an authorized member', 'complete');
    }
    await enqueueNotice({
      eventType: 'unknown_sender',
      recipientEmail: senderEmail,
      dedupeKey: `unknown-sender/${await sha256(senderEmail)}`,
    });
    throw new JobOutcome('Sender is not a registered member; registration notice queued', 'complete');
  }

  await ensureSenderCanWrite(sender as SenderProfile, route, providerEmailId);

  const existing = await existingLetter(providerEmailId);
  if (existing?.provider_outbound_id || existing?.state === 'delivered') return;

  let prepared: ReturnType<typeof prepareLetterContent>;
  try {
    prepared = prepareLetterContent({ text: email.text, html: email.html });
  } catch {
    await enqueueNotice({
      eventType: 'letter_body_missing',
      recipientEmail: senderEmail,
      memberId: sender.id,
      dedupeKey: `letter-body-missing/${providerEmailId}`,
    });
    throw new JobOutcome('The email does not contain a letter body', 'complete');
  }
  if (prepared.truncated) {
    await enqueueNotice({
      eventType: 'letter_too_long',
      recipientEmail: senderEmail,
      memberId: sender.id,
      dedupeKey: `letter-too-long/${providerEmailId}`,
      payload: { characterLimit: MAX_LETTER_CHARACTERS },
    });
    throw new JobOutcome('The letter exceeds the character limit', 'complete');
  }

  let openingLanguageCode: string | null = null;
  if (route.kind === 'opening') {
    const detection = detectLetterLanguage(prepared.text, franc);
    if (detection.kind === 'too_short') {
      await enqueueNotice({
        eventType: 'letter_language_too_short',
        recipientEmail: senderEmail,
        memberId: sender.id,
        dedupeKey: `letter-language-too-short/${providerEmailId}`,
      });
      throw new JobOutcome('The opening letter is too short to identify its language', 'complete');
    }
    if (detection.kind === 'unsupported') {
      await enqueueNotice({
        eventType: 'letter_language_unsupported',
        recipientEmail: senderEmail,
        memberId: sender.id,
        dedupeKey: `letter-language-unsupported/${providerEmailId}`,
      });
      throw new JobOutcome('The opening letter language is not supported', 'complete');
    }
    openingLanguageCode = detection.languageCode;
  }
  const encrypted = await encryptLetter(prepared.text, requireEnvironment('LETTER_CONTENT_KEK'));
  const attachmentCount = Math.min(email.attachments?.length ?? 0, 32_767);

  let letter = existing;
  if (!letter && route.kind === 'opening') {
    letter = await reserveOpening({
      providerEmailId,
      senderId: sender.id,
      body: prepared.text,
      encrypted,
      attachmentCount,
      messageId: email.message_id ?? null,
      sender: sender as SenderProfile,
      attempt: job.attempts,
      languageCode: openingLanguageCode,
    });
  } else if (!letter && route.kind === 'reply') {
    letter = await reserveReply({
      providerEmailId,
      senderId: sender.id,
      aliasToken: route.token,
      body: prepared.text,
      encrypted,
      attachmentCount,
      messageId: email.message_id ?? null,
      senderEmail,
    });
  }

  if (!letter) throw new Error('Letter reservation did not return a letter');
  const { data: recipientProfile, error: recipientProfileError } = await admin
    .from('profiles')
    .select('account_status')
    .eq('id', letter.recipient_id)
    .maybeSingle();
  if (recipientProfileError) throw recipientProfileError;
  if (!recipientProfile || recipientProfile.account_status === 'closed') {
    await admin.rpc('record_letter_failure', {
      p_letter_id: letter.id,
      p_reason: 'Recipient account is closed and does not accept new letters',
      p_bounced: false,
    });
    throw new JobOutcome('Recipient account is closed; letter not delivered', 'complete');
  }
  await ensureConversationAliases(letter);
  const recipientEmail = await memberEmail(letter.recipient_id);
  const aliasToken = await deriveAliasToken(
    requireEnvironment('ALIAS_HMAC_SECRET'),
    letter.correspondence_id,
    letter.recipient_id,
  );
  const aliasDomain = Deno.env.get('LETTER_ALIAS_DOMAIN') ?? 'letters.onereader.co';
  const replyAddress = `r-${aliasToken}@${aliasDomain}`;
  const subject = letter.kind === 'reply' ? 'Re: A letter for you' : 'A letter for you';
  const actionSecret = requireEnvironment('ALIAS_HMAC_SECRET');
  const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://onereader.co').replace(/\/+$/, '');
  const stopToken = await createLetterActionToken({
    secret: actionSecret,
    action: 'stop',
    letterId: letter.id,
    memberId: letter.recipient_id,
  });
  const reportToken = await createLetterActionToken({
    secret: actionSecret,
    action: 'report',
    letterId: letter.id,
    memberId: letter.recipient_id,
  });
  const rendered = renderLetterEmail({
    body: prepared.text,
    subject,
    isReply: letter.kind === 'reply',
    attachmentsRemoved: attachmentCount > 0,
    stopUrl: `${siteUrl}/email/action/stop/?token=${encodeURIComponent(stopToken)}`,
    reportUrl: `${siteUrl}/email/action/report/?token=${encodeURIComponent(reportToken)}`,
  });

  const { data: sent, error: sendError } = await resend.emails.send({
    from: `One Reader <${replyAddress}>`,
    to: recipientEmail,
    replyTo: replyAddress,
    subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      'X-One-Reader-Letter': letter.id,
      'Auto-Submitted': 'no',
    },
  }, { idempotencyKey: `letter/${letter.id}` });

  if (sendError || !sent?.id) {
    await admin.rpc('record_letter_failure', {
      p_letter_id: letter.id,
      p_reason: sendError?.message ?? 'Resend rejected the delivery request',
      p_bounced: false,
    });
    throw new Error(sendError?.message ?? 'Resend rejected the delivery request');
  }

  const { error: sentError } = await admin.rpc('record_letter_sent', {
    p_letter_id: letter.id,
    p_provider_outbound_id: sent.id,
  });
  if (sentError) throw sentError;

  if (attachmentCount > 0) {
    await enqueueNotice({
      eventType: 'attachments_removed',
      recipientEmail: senderEmail,
      memberId: sender.id,
      letterId: letter.id,
      correspondenceId: letter.correspondence_id,
      dedupeKey: `attachments-removed/${letter.id}`,
    });
  }
}

async function reserveOpening(input: {
  providerEmailId: string;
  senderId: string;
  body: string;
  encrypted: Awaited<ReturnType<typeof encryptLetter>>;
  attachmentCount: number;
  messageId: string | null;
  sender: SenderProfile;
  attempt: number;
  languageCode: string | null;
}): Promise<ExistingLetter> {
  const admin = createAdminClient();

  // Free members receive and reply without limits, but only the first
  // opening is included. The rejected body is never stored.
  if (input.sender.account_status === 'free') {
    const { count, error: openingError } = await admin
      .from('letters')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', input.sender.id)
      .eq('kind', 'opening')
      .neq('state', 'failed');
    if (openingError) throw openingError;
    if ((count ?? 0) > 0) {
      await enqueueNotice({
        eventType: 'cadence_limited_free',
        recipientEmail: input.sender.email_address,
        memberId: input.sender.id,
        dedupeKey: `membership-required/${input.providerEmailId}`,
        payload: { membershipRequired: true },
      });
      throw new JobOutcome('The Free opening has already been used; annual membership is required for another opening', 'complete');
    }
  }

  const correspondenceId = crypto.randomUUID();
  const letterId = crypto.randomUUID();
  const secret = requireEnvironment('ALIAS_HMAC_SECRET');
  const senderToken = await deriveAliasToken(secret, correspondenceId, input.senderId);
  const senderAliasHash = await hashAliasToken(senderToken);

  // The recipient is selected inside the transaction, so its token cannot be
  // derived beforehand. A random lookup token is used for that direction; the
  // worker later derives outbound aliases from the stable conversation tuple.
  const provisionalRecipientToken = randomToken();
  const recipientAliasHash = await hashAliasToken(provisionalRecipientToken);
  const { data, error } = await admin.rpc('reserve_opening_letter', {
    p_correspondence_id: correspondenceId,
    p_letter_id: letterId,
    p_sender_id: input.senderId,
    p_provider_inbound_id: input.providerEmailId,
    p_subject: 'A letter for you',
    p_language_code: input.languageCode,
    p_sender_alias_hash: senderAliasHash,
    p_recipient_alias_hash: recipientAliasHash,
    p_content_ciphertext: input.encrypted.ciphertext,
    p_content_iv: input.encrypted.iv,
    p_wrapped_dek: input.encrypted.wrappedDek,
    p_content_key_version: input.encrypted.keyVersion,
    p_attachment_count: input.attachmentCount,
    p_source_message_id: input.messageId,
  });
  if (error) throw error;
  const reservation = data?.[0];
  if (!reservation || reservation.result !== 'assigned') {
    if (reservation?.result === 'no_candidate') {
      if (input.attempt >= 8) {
        await enqueueNotice({
          eventType: 'opening_failed',
          recipientEmail: input.sender.email_address,
          memberId: input.sender.id,
          dedupeKey: `opening-failed/${input.providerEmailId}`,
        });
        throw new JobOutcome('No eligible reader was found before the retry limit', 'complete');
      }
      await enqueueNotice({
        eventType: 'opening_waiting_for_reader',
        recipientEmail: input.sender.email_address,
        memberId: input.sender.id,
        dedupeKey: `opening-waiting/${input.providerEmailId}`,
      });
      throw new JobOutcome('No eligible reader is currently available', 'retry', 3600);
    }
    if (reservation?.result === 'cadence_limited') {
      const nextAvailableAt = reservation.next_available_at ?? null;
      const isFree = input.sender.account_status === 'free';
      let freeAttemptCount = 0;
      if (isFree) {
        const { error: recordError } = await admin.rpc('record_free_cadence_attempt', {
          p_sender_id: input.sender.id,
        });
        if (recordError) throw recordError;
        const { count, error: attemptError } = await admin
          .from('opening_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', input.sender.id)
          .gte('attempted_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
        if (attemptError) throw attemptError;
        freeAttemptCount = count ?? 0;
      }
      const upgradeReminder = isFree && freeAttemptCount === 2;
      await enqueueNotice({
        eventType: isFree ? 'cadence_limited_free' : 'cadence_limited_daily',
        recipientEmail: input.sender.email_address,
        memberId: input.sender.id,
        dedupeKey: upgradeReminder
          ? `cadence-upgrade/${input.sender.id}/${nextAvailableAt ?? input.providerEmailId}`
          : `cadence/${input.sender.id}/${nextAvailableAt ?? input.providerEmailId}`,
        payload: { nextAvailableAt, upgradeReminder },
      });
      throw new JobOutcome('The sender cadence is not available yet; letter not retained', 'complete');
    }
    await enqueueNotice({
      eventType: openingRejectionEvent(reservation?.result),
      recipientEmail: input.sender.email_address,
      memberId: input.sender.id,
      dedupeKey: `opening-rejected/${input.providerEmailId}`,
    });
    throw new JobOutcome(`Opening letter rejected: ${reservation?.result ?? 'unknown'}`, 'complete');
  }

  return {
    id: letterId,
    correspondence_id: correspondenceId,
    sender_id: input.senderId,
    recipient_id: reservation.recipient_id,
    kind: 'opening',
    state: 'assigned',
    provider_outbound_id: null,
    attachment_count: input.attachmentCount,
  };
}

async function ensureConversationAliases(letter: ExistingLetter) {
  const admin = createAdminClient();
  const secret = requireEnvironment('ALIAS_HMAC_SECRET');
  for (const permittedSenderId of [letter.sender_id, letter.recipient_id]) {
    const token = await deriveAliasToken(secret, letter.correspondence_id, permittedSenderId);
    const { error } = await admin
      .from('conversation_aliases')
      .update({ token_hash: await hashAliasToken(token) })
      .eq('correspondence_id', letter.correspondence_id)
      .eq('permitted_sender_id', permittedSenderId);
    if (error) throw error;
  }
}

async function reserveReply(input: {
  providerEmailId: string;
  senderId: string;
  aliasToken: string;
  body: string;
  encrypted: Awaited<ReturnType<typeof encryptLetter>>;
  attachmentCount: number;
  messageId: string | null;
  senderEmail: string;
}): Promise<ExistingLetter> {
  const admin = createAdminClient();
  const letterId = crypto.randomUUID();
  let canonicalAliasToken = input.aliasToken;
  const { data: activeAliases, error: aliasError } = await admin
    .from('conversation_aliases')
    .select('correspondence_id, permitted_sender_id, active, expires_at')
    .eq('permitted_sender_id', input.senderId)
    .eq('active', true)
    .gt('expires_at', new Date().toISOString());
  if (aliasError) throw new Error(`Could not inspect conversation aliases: ${errorMessage(aliasError)}`);
  for (const alias of activeAliases ?? []) {
    const derivedToken = await deriveAliasToken(
      requireEnvironment('ALIAS_HMAC_SECRET'),
      alias.correspondence_id,
      alias.permitted_sender_id,
    );
    if (derivedToken.toLowerCase() === input.aliasToken.toLowerCase()) {
      canonicalAliasToken = derivedToken;
      break;
    }
  }
  const { data, error } = await admin.rpc('reserve_reply_letter', {
    p_letter_id: letterId,
    p_alias_hash: await hashAliasToken(canonicalAliasToken),
    p_sender_id: input.senderId,
    p_provider_inbound_id: input.providerEmailId,
    p_subject: 'Re: A letter for you',
    p_content_ciphertext: input.encrypted.ciphertext,
    p_content_iv: input.encrypted.iv,
    p_wrapped_dek: input.encrypted.wrappedDek,
    p_content_key_version: input.encrypted.keyVersion,
    p_attachment_count: input.attachmentCount,
    p_source_message_id: input.messageId,
  });
  if (error) throw error;
  const reservation = data?.[0];
  if (!reservation || reservation.result !== 'assigned') {
    await enqueueNotice({
      eventType: 'reply_not_delivered',
      recipientEmail: input.senderEmail,
      memberId: input.senderId,
      dedupeKey: `reply-not-delivered/${input.providerEmailId}`,
    });
    throw new JobOutcome(`Reply rejected: ${reservation?.result ?? 'unknown'}`, 'complete');
  }

  return {
    id: letterId,
    correspondence_id: reservation.correspondence_id,
    sender_id: input.senderId,
    recipient_id: reservation.recipient_id,
    kind: 'reply',
    state: 'assigned',
    provider_outbound_id: null,
    attachment_count: input.attachmentCount,
  };
}

async function existingLetter(providerEmailId: string): Promise<ExistingLetter | null> {
  const { data, error } = await createAdminClient()
    .from('letters')
    .select('id, correspondence_id, sender_id, recipient_id, kind, state, provider_outbound_id, attachment_count')
    .eq('provider_inbound_id', providerEmailId)
    .maybeSingle();
  if (error) throw error;
  return data as ExistingLetter | null;
}

async function memberEmail(memberId: string) {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('email_address')
    .eq('id', memberId)
    .single();
  if (error || !data?.email_address) throw error ?? new Error('Recipient has no verified email address');
  return data.email_address as string;
}

function inboundRoute(email: ReceivedEmail): { kind: 'opening' } | { kind: 'reply'; token: string } {
  const addresses = [...(email.to ?? []), ...(email.received_for ?? [])].map(normalizeEmailAddress);
  const configuredWriteAddress = (Deno.env.get('LETTER_WRITE_ADDRESS') ?? 'write@onereader.co').toLowerCase();
  const inboundWriteAddresses = new Set([
    configuredWriteAddress,
    'write@onereader.co',
    'write@letters.onereader.co',
  ]);
  if (addresses.some((address) => inboundWriteAddresses.has(address))) return { kind: 'opening' };

  const aliasDomain = (Deno.env.get('LETTER_ALIAS_DOMAIN') ?? 'letters.onereader.co').toLowerCase();
  for (const address of addresses) {
    const match = address.match(new RegExp(`^r-([A-Za-z0-9_-]{20,64})@${escapeRegExp(aliasDomain)}$`));
    if (match) return { kind: 'reply', token: match[1] };
  }
  throw new JobOutcome('Message was not addressed to the writing address or a valid alias', 'complete');
}

async function completeJob(job: MailJob, note?: string, ignored = false) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('complete_mail_job', { p_job_id: job.id });
  if (error) throw error;
  await admin
    .from('email_provider_events')
    .update({
      status: ignored ? 'ignored' : 'processed',
      failure_reason: note ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', job.provider_event_id);
}

async function retryJob(job: MailJob, message: string, delaySeconds: number) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('retry_mail_job', {
    p_job_id: job.id,
    p_error: message,
    p_delay_seconds: delaySeconds,
    p_max_attempts: 8,
  });
  if (error) throw error;
  await admin
    .from('email_provider_events')
    .update({ status: 'failed', failure_reason: message })
    .eq('id', job.provider_event_id);
}

function authorized(request: Request) {
  const secret = Deno.env.get('WORKER_SECRET');
  return Boolean(secret && request.headers.get('Authorization') === `Bearer ${secret}`);
}

function retryDelay(attempts: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureSenderCanWrite(
  sender: SenderProfile,
  route: { kind: 'opening' } | { kind: 'reply'; token: string },
  providerEmailId: string,
) {
  if (route.kind === 'reply') return;

  let eventType: EnqueueTransactionalEmailInput['eventType'] | null = null;
  if (!sender.email_verified_at || sender.account_status === 'pending_email') {
    eventType = 'account_verification_required';
  } else if (sender.account_status === 'waitlisted') {
    eventType = 'waitlist_not_open';
  } else if (sender.account_status === 'delivery_paused') {
    eventType = 'delivery_paused';
  } else if (sender.account_status === 'closed') {
    eventType = 'account_closed';
  } else if (!sender.service_eligible_at || !sender.adult_pool_eligible_at) {
    eventType = 'profile_incomplete';
  } else if (sender.service_eligible_at > new Date().toISOString().slice(0, 10)) {
    eventType = 'minimum_age_not_met';
  } else {
    const { data, error } = await createAdminClient()
      .from('member_languages')
      .select('id')
      .eq('user_id', sender.id)
      .limit(1);
    if (error) throw error;
    if (!data?.length) eventType = 'profile_incomplete';
  }

  if (!eventType && !['founding', 'free', 'annual'].includes(sender.account_status)) {
    eventType = 'profile_incomplete';
  }
  if (!eventType) return;

  await enqueueNotice({
    eventType,
    recipientEmail: sender.email_address,
    memberId: sender.id,
    dedupeKey: `opening-preflight/${eventType}/${providerEmailId}`,
  });
  throw new JobOutcome(`Opening preflight rejected: ${eventType}`, 'complete');
}

function openingRejectionEvent(result: string | undefined): EnqueueTransactionalEmailInput['eventType'] {
  if (result === 'sender_not_verified') return 'account_verification_required';
  if (result === 'sender_profile_incomplete') return 'profile_incomplete';
  if (result === 'sender_too_young') return 'minimum_age_not_met';
  return 'opening_failed';
}

async function enqueueNotice(input: EnqueueTransactionalEmailInput) {
  await enqueueTransactionalEmail(createAdminClient(), input);
}

async function enqueueTerminalFailure(job: MailJob) {
  const providerEmailId = job.payload.provider_email_id;
  if (!providerEmailId) return;
  const letter = await existingLetter(providerEmailId);
  if (!letter) return;
  const senderEmail = await memberEmail(letter.sender_id);
  await enqueueNotice({
    eventType: letter.kind === 'opening' ? 'opening_failed' : 'reply_not_delivered',
    recipientEmail: senderEmail,
    memberId: letter.sender_id,
    letterId: letter.id,
    correspondenceId: letter.correspondence_id,
    dedupeKey: `terminal-delivery-failure/${letter.id}`,
  });
}

function kickTransactionalWorker() {
  const secret = Deno.env.get('WORKER_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!secret || !supabaseUrl) return;
  EdgeRuntime.waitUntil(fetch(`${supabaseUrl}/functions/v1/transactional-worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => undefined));
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
