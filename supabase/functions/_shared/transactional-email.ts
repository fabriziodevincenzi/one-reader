import {
  renderServiceEmail,
  type EmailDetail,
} from './email-layout.ts';

export const TRANSACTIONAL_EMAIL_EVENTS = [
  'unknown_sender',
  'account_verification_required',
  'waitlist_not_open',
  'profile_incomplete',
  'minimum_age_not_met',
  'delivery_paused',
  'account_closed',
  'cadence_limited_free',
  'cadence_limited_daily',
  'letter_body_missing',
  'letter_too_long',
  'attachments_removed',
  'opening_waiting_for_reader',
  'opening_failed',
  'opening_delivered',
  'reply_not_delivered',
  'privacy_request_received',
  'letter_report_received',
  'membership_activated',
  'renewal_upcoming',
  'refund_request_received',
] as const;

export type TransactionalEmailEvent = typeof TRANSACTIONAL_EMAIL_EVENTS[number];

export type TransactionalEmailInput = {
  eventType: TransactionalEmailEvent;
  payload?: Record<string, unknown>;
  siteUrl?: string;
};

type EmailCopy = {
  subject: string;
  preheader: string;
  heading?: string;
  paragraphs: string[];
  details?: EmailDetail[];
  action?: { label: string; href: string };
  secondary?: { label: string; href: string };
};

export function isTransactionalEmailEvent(value: string): value is TransactionalEmailEvent {
  return (TRANSACTIONAL_EMAIL_EVENTS as readonly string[]).includes(value);
}

export function renderTransactionalEmail(input: TransactionalEmailInput) {
  const siteUrl = (input.siteUrl ?? 'https://onereader.co').replace(/\/+$/, '');
  const copy = emailCopy(input.eventType, input.payload ?? {}, siteUrl);
  const rendered = renderServiceEmail(copy);
  return { subject: copy.subject, ...rendered };
}

function emailCopy(eventType: TransactionalEmailEvent, payload: Record<string, unknown>, siteUrl: string): EmailCopy {
  const memberUrl = `${siteUrl}/member/`;
  const signupUrl = `${siteUrl}/sign-in/?mode=signup`;
  const signInUrl = `${siteUrl}/sign-in/`;
  const pricingUrl = `${siteUrl}/pricing/`;
  const nextAvailable = formatDate(payload.nextAvailableAt);
  const characterLimit = integer(payload.characterLimit, 50_000).toLocaleString('en-GB');

  switch (eventType) {
    case 'unknown_sender':
      return {
        subject: 'Register before sending a letter',
        preheader: 'No account was created and your letter was not kept.',
        heading: 'First, make a place for your letter.',
        paragraphs: [
          'This address is not connected to a One Reader account. We did not create an account for you, and we did not keep or forward the text of your letter.',
          'Register explicitly, complete your profile, then send a new letter when writing is available.',
        ],
        action: { label: 'Register for One Reader', href: signupUrl },
      };
    case 'account_verification_required':
      return {
        subject: 'Verify your email before writing',
        preheader: 'Your letter was not sent.',
        heading: 'Your email still needs verifying.',
        paragraphs: ['We did not keep or forward this letter. Verify your address, then send it again from the same inbox.'],
        action: { label: 'Verify or request a new link', href: signInUrl },
      };
    case 'waitlist_not_open':
      return {
        subject: 'Your place is saved',
        preheader: 'Writing has not opened for your group yet.',
        heading: 'Writing will open with your group.',
        paragraphs: [
          'Your waitlist place is safe, but this letter was not kept or forwarded.',
          'We will write when your founding season opens. Then you can send a new letter.',
        ],
        action: { label: 'View your account', href: memberUrl },
      };
    case 'profile_incomplete':
      return {
        subject: 'Complete your profile before writing',
        preheader: 'Your letter was not sent.',
        heading: 'A few details are still missing.',
        paragraphs: [
          'One Reader needs your birth month and year, languages, and receiving preference before it can choose an appropriate reader.',
          'This letter was not kept or forwarded. Complete your profile, then send it again.',
        ],
        action: { label: 'Complete your profile', href: `${memberUrl}#profile` },
      };
    case 'minimum_age_not_met':
      return {
        subject: 'One Reader is available from age 14',
        preheader: 'Your letter was not stored or sent.',
        heading: 'You cannot use One Reader yet.',
        paragraphs: [
          'One Reader is available to people aged 14 and over. We did not keep or forward the text of your letter.',
          'Your birth month and year remain part of your account record and can only be corrected through a privacy request.',
        ],
        action: { label: 'View your privacy choices', href: `${memberUrl}#privacy` },
      };
    case 'delivery_paused':
      return {
        subject: 'Writing is paused for this account',
        preheader: 'Check your inbox status before sending again.',
        heading: 'Your mailbox needs reactivating.',
        paragraphs: ['This letter was not forwarded. Verify that this inbox can receive One Reader mail, reactivate delivery, then send a new letter.'],
        action: { label: 'Review mailbox settings', href: `${memberUrl}#mailbox` },
      };
    case 'account_closed':
      return {
        subject: 'This One Reader account is closed',
        preheader: 'Your letter was not sent.',
        heading: 'There is no active account for this address.',
        paragraphs: ['We did not keep or forward this letter. If you believe the account was closed by mistake, contact One Reader from the website.'],
        action: { label: 'Visit One Reader', href: siteUrl },
      };
    case 'cadence_limited_free':
      if (payload.membershipRequired === true) {
        return {
          subject: 'Your first letter has been sent',
          preheader: 'Annual membership opens a new correspondence every 24 hours.',
          heading: 'Your first opening has been used.',
          paragraphs: [
            'This new letter was not kept or forwarded. Your Free account remains active: you can receive letters and reply to every open conversation.',
            'Annual membership is €18/year and lets you begin a new correspondence every 24 hours.',
          ],
          action: { label: 'Become a member', href: pricingUrl },
          secondary: { label: 'View your account', href: memberUrl },
        };
      }
      if (payload.upgradeReminder === true) {
        return {
          subject: 'Write more often when you are ready',
          preheader: 'Your Free account is still active; annual membership is there when you want it.',
          heading: 'The next letter can wait. Or not.',
          paragraphs: [
            `Your Free membership can begin another correspondence ${nextAvailable}. This letter was not kept or forwarded.`,
            'Your account stays active, and every open conversation can continue. If you would like to write again sooner, annual membership opens a new correspondence every 24 hours.',
          ],
          action: { label: 'See annual membership', href: pricingUrl },
          secondary: { label: 'View your account', href: memberUrl },
        };
      }
      return {
        subject: `You can begin another letter ${nextAvailable}`,
        preheader: 'Your new letter was not sent.',
        heading: 'This new letter is too soon.',
        paragraphs: [
          `Your Free membership can begin another correspondence ${nextAvailable}. This letter was not kept or forwarded.`,
          'Until then, you can still receive letters and continue every open correspondence. Replies never use your opening allowance.',
        ],
        action: { label: 'View your account', href: memberUrl },
        secondary: { label: 'See annual membership', href: pricingUrl },
      };
    case 'cadence_limited_daily':
      return {
        subject: `You can begin another letter ${nextAvailable}`,
        preheader: 'The 24-hour interval has not finished yet.',
        heading: 'Your next opening is nearly available.',
        paragraphs: [
          `You can begin a new correspondence ${nextAvailable}. This letter was not kept or forwarded.`,
          'You can still receive letters and continue every open correspondence in the meantime.',
        ],
        action: { label: 'View your account', href: memberUrl },
      };
    case 'letter_body_missing':
      return {
        subject: 'Put your letter in the body of the email',
        preheader: 'Here, only the words travel.',
        heading: 'We could not find a letter to send.',
        paragraphs: ['Attachments do not travel through One Reader. Write or paste the words into the email body, then send the message again.'],
      };
    case 'letter_too_long':
      return {
        subject: 'Your letter is too long to send',
        preheader: `The current limit is ${characterLimit} characters.`,
        heading: 'Please make this letter a little shorter.',
        paragraphs: [`The current limit is ${characterLimit} characters. We did not truncate, keep, or forward your letter. Shorten it and send it again.`],
      };
    case 'attachments_removed':
      return {
        subject: 'Your letter travelled without its attachments',
        preheader: 'The text was accepted; files were removed.',
        heading: 'Here, only the words travel.',
        paragraphs: ['Your text was accepted. Images and files were removed before delivery and were not shared with the other reader.'],
      };
    case 'opening_waiting_for_reader':
      return {
        subject: 'We are looking for the right reader',
        preheader: 'Your letter is still waiting safely.',
        heading: 'Your letter is waiting for one reader.',
        paragraphs: [
          'No suitable reader was available on the first attempt. Your letter remains encrypted while we try again, and it will be delivered no more than once.',
          'We will write again only when it is delivered or if no reader can be found.',
        ],
      };
    case 'opening_failed':
      return {
        subject: 'Your letter could not be delivered',
        preheader: 'The attempt is now closed.',
        heading: 'This letter did not reach a reader.',
        paragraphs: [
          'The delivery attempt is closed and the letter will not be sent later without you knowing.',
          'You may write again. A failed delivery does not intentionally use your allowance.',
        ],
      };
    case 'opening_delivered':
      return {
        subject: 'Your letter has reached one reader',
        preheader: 'It was delivered once, without revealing either address.',
        heading: 'Your letter has found its reader.',
        paragraphs: [
          'It was delivered to one eligible person. Both real email addresses remain hidden.',
          'There is nothing else to do. If they reply, the answer will arrive in this inbox.',
        ],
      };
    case 'reply_not_delivered':
      return {
        subject: 'Your reply could not be delivered',
        preheader: 'This private correspondence is no longer available.',
        heading: 'This reply did not travel.',
        paragraphs: [
          'The private correspondence is closed or no longer accepts messages. We did not forward your reply.',
          'For privacy, One Reader cannot share more information about the other person or the reason the correspondence ended.',
        ],
      };
    case 'privacy_request_received': {
      const requestType = readableRequestType(string(payload.requestType));
      const requestId = string(payload.requestId) || 'not available';
      return {
        subject: 'We received your privacy request',
        preheader: `Reference ${requestId}`,
        heading: 'Your request is recorded.',
        paragraphs: [
          `Request: ${requestType}. Reference: ${requestId}.`,
          string(payload.requestType) === 'deletion'
            ? 'Your account is now closed and new deliveries are stopped. We retain only the minimum records needed for up to 30 days to handle the request or a related dispute, unless a longer legal obligation applies.'
            : 'You can follow its status in your account. We will contact you if identity verification or more information is needed.',
        ],
        action: { label: 'View privacy requests', href: `${memberUrl}#privacy` },
      };
    }
    case 'letter_report_received': {
      const reportId = string(payload.reportId) || 'not available';
      const letterId = string(payload.letterId) || 'not available';
      const correspondenceId = string(payload.correspondenceId) || 'not available';
      const reporterId = string(payload.reporterId) || 'not available';
      const reporterEmail = string(payload.reporterEmail) || 'not available';
      const senderId = string(payload.senderId) || 'not available';
      const category = readableReportCategory(string(payload.category));
      return {
        subject: 'New letter report received',
        preheader: `Report ${reportId}: ${category}`,
        heading: 'A letter needs review.',
        paragraphs: [
          `Category: ${category}. Report reference: ${reportId}.`,
          `Letter: ${letterId}. Correspondence: ${correspondenceId}.`,
          `Reported by: ${reporterEmail} (member ${reporterId}). Sender member: ${senderId}.`,
          'The correspondence has been closed and its reply addresses disabled. The letter remains encrypted; review the report in the protected operator environment.',
        ],
      };
    }
    case 'membership_activated': {
      const renewalAt = formatDateOnly(payload.renewalAt);
      const amount = formatMoney(payload.unitAmount, payload.currency);
      return {
        subject: 'Your One Reader membership is active',
        preheader: `Your next renewal is scheduled for ${renewalAt}.`,
        heading: 'Your annual membership is active.',
        paragraphs: [
          'You can now begin a new correspondence every 24 hours. Receiving letters and replying to open correspondences remain available as before.',
          'Your membership renews automatically unless you cancel it before the renewal date.',
        ],
        details: [
          ...(amount ? [{ label: 'Renewal amount', value: amount }] : []),
          { label: 'Next renewal', value: renewalAt },
        ],
        action: { label: 'Manage membership', href: `${memberUrl}#membership` },
      };
    }
    case 'renewal_upcoming': {
      const renewalAt = formatDateOnly(payload.renewalAt);
      const cancellationDeadlineAt = formatDateOnly(payload.cancellationDeadlineAt ?? payload.renewalAt);
      const amount = formatMoney(payload.unitAmount, payload.currency);
      return {
        subject: `Your One Reader membership renews on ${formatDateOnly(payload.renewalAt)}`,
        preheader: amount ? `${amount} will be charged automatically unless you cancel before renewal.` : 'Your annual membership is approaching its automatic renewal.',
        heading: 'Your annual membership is approaching renewal.',
        paragraphs: [
          `Your One Reader membership will renew automatically on ${renewalAt}.`,
          `If you do not want it to renew, cancel before ${cancellationDeadlineAt}. You can do this from your membership settings.`,
          'Cancelling stops the next charge. Your current membership remains active until the end of the paid period, and your open correspondences remain available.',
        ],
        details: [
          ...(amount ? [{ label: 'Renewal amount', value: amount }] : []),
          { label: 'Renewal date', value: renewalAt },
          { label: 'Cancel before', value: cancellationDeadlineAt },
        ],
        action: { label: 'Manage or cancel membership', href: `${memberUrl}#membership` },
      };
    }
    case 'refund_request_received': {
      const requestId = string(payload.requestId) || 'not available';
      return {
        subject: 'We received your One Reader refund request',
        preheader: `Request ${requestId} is ready for review.`,
        heading: 'Your request is recorded.',
        paragraphs: [
          'We received your refund request and will review it. No refund is automatic, and we will write again when the review is complete or if more information is needed.',
        ],
        details: [{ label: 'Request reference', value: requestId }],
        action: { label: 'View membership', href: `${memberUrl}#membership` },
      };
    }
  }
}

function formatDate(value: unknown) {
  const parsed = new Date(string(value));
  if (Number.isNaN(parsed.getTime())) return 'when your current interval ends';
  return `${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed)} UTC`;
}

function readableRequestType(value: string) {
  if (value === 'access') return 'copy of your data';
  if (value === 'rectification') return 'correction of your data';
  if (value === 'deletion') return 'deletion of your account and data';
  return 'privacy request';
}

function readableReportCategory(value: string) {
  if (value === 'sexual_explicit') return 'sexual or explicit content';
  if (value === 'harassment_threats') return 'harassment or threats';
  if (value === 'hate_discrimination') return 'hate or discrimination';
  if (value === 'personal_data') return 'request for or exposure of personal information';
  if (value === 'spam_fraud') return 'spam, fraud or promotion';
  if (value === 'other') return 'other rule violation';
  return 'uncategorised';
}

function string(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function integer(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function formatDateOnly(value: unknown) {
  const parsed = new Date(string(value));
  if (Number.isNaN(parsed.getTime())) return 'its next renewal date';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatMoney(value: unknown, currencyValue: unknown) {
  const amount = typeof value === 'number' && Number.isSafeInteger(value) ? value : Number.NaN;
  const currency = string(currencyValue).toUpperCase();
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return '';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}
