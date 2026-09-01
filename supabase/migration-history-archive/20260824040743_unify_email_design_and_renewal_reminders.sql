alter table public.transactional_email_outbox
  drop constraint if exists transactional_email_outbox_event_type_check;

alter table public.transactional_email_outbox
  add constraint transactional_email_outbox_event_type_check
  check (event_type in (
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
    'refund_request_received'
  ));

alter table public.profiles
  add column if not exists subscription_currency text
    check (subscription_currency is null or subscription_currency ~ '^[a-z]{3}$'),
  add column if not exists subscription_unit_amount bigint
    check (subscription_unit_amount is null or subscription_unit_amount >= 0);

create index if not exists transactional_email_outbox_renewal_idx
  on public.transactional_email_outbox (member_id, available_at)
  where event_type = 'renewal_upcoming'
    and status in ('pending', 'retry', 'processing');
