import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { enqueueTransactionalEmail } from './transactional-outbox.ts';

const LEGAL_RENEWAL_NOTICE_DAYS = 30;
// Queue one day earlier so a daily worker still delivers no later than the
// Italian 30-day notice threshold.
const RENEWAL_QUEUE_DAYS = LEGAL_RENEWAL_NOTICE_DAYS + 1;
const RENEWAL_QUEUE_MS = RENEWAL_QUEUE_DAYS * 24 * 60 * 60 * 1000;

export type BillingEmailSubscription = {
  memberId: string;
  recipientEmail: string;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  renewalAt: string | null;
  currency?: string | null;
  unitAmount?: number | null;
};

export async function enqueueMembershipActivatedEmail(
  admin: SupabaseClient,
  input: BillingEmailSubscription,
) {
  await enqueueTransactionalEmail(admin, {
    eventType: 'membership_activated',
    recipientEmail: input.recipientEmail,
    memberId: input.memberId,
    dedupeKey: `membership-activated/${input.subscriptionId}`,
    payload: billingPayload(input),
  });
}

export async function syncUpcomingRenewalEmail(
  admin: SupabaseClient,
  input: BillingEmailSubscription,
) {
  const renewalAt = input.renewalAt ? new Date(input.renewalAt) : null;
  const isRenewing = ['active', 'trialing'].includes(input.status)
    && !input.cancelAtPeriodEnd
    && renewalAt
    && !Number.isNaN(renewalAt.getTime());
  const currentDedupeKey = isRenewing
    ? `renewal-upcoming/${input.subscriptionId}/${renewalAt.toISOString()}`
    : '';

  let stale = admin
    .from('transactional_email_outbox')
    .update({ status: 'cancelled', locked_until: null, processed_at: new Date().toISOString() })
    .eq('member_id', input.memberId)
    .eq('event_type', 'renewal_upcoming')
    .in('status', ['pending', 'retry']);
  if (currentDedupeKey) stale = stale.neq('dedupe_key', currentDedupeKey);
  const { error: cancelError } = await stale;
  if (cancelError) throw cancelError;

  if (!isRenewing || !renewalAt) return;
  const availableAt = new Date(Math.max(Date.now(), renewalAt.getTime() - RENEWAL_QUEUE_MS)).toISOString();
  await enqueueTransactionalEmail(admin, {
    eventType: 'renewal_upcoming',
    recipientEmail: input.recipientEmail,
    memberId: input.memberId,
    dedupeKey: currentDedupeKey,
    availableAt,
    payload: billingPayload(input),
  });
}

function billingPayload(input: BillingEmailSubscription) {
  const renewalTime = input.renewalAt ? new Date(input.renewalAt).getTime() : Number.NaN;
  const cancellationDeadlineAt = Number.isFinite(renewalTime)
    ? new Date(renewalTime - 24 * 60 * 60 * 1000).toISOString()
    : input.renewalAt;
  return {
    subscriptionId: input.subscriptionId,
    renewalAt: input.renewalAt,
    cancellationDeadlineAt,
    currency: input.currency?.toUpperCase() ?? null,
    unitAmount: input.unitAmount ?? null,
    noticeDays: LEGAL_RENEWAL_NOTICE_DAYS,
  };
}
