alter table public.transactional_email_outbox
  drop constraint transactional_email_outbox_event_type_check;

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
    'letter_report_received'
  ));

create or replace function private.enqueue_letter_report_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter_email text;
  reported_correspondence_id uuid;
  reported_sender_id uuid;
begin
  select reporter.email_address, letter.correspondence_id, letter.sender_id
    into reporter_email, reported_correspondence_id, reported_sender_id
  from public.profiles as reporter
  join public.letters as letter on letter.id = new.letter_id
  where reporter.id = new.reporter_id;

  insert into public.transactional_email_outbox (
    event_type,
    recipient_email,
    member_id,
    letter_id,
    correspondence_id,
    dedupe_key,
    payload
  ) values (
    'letter_report_received',
    'customers@onereader.co',
    new.reporter_id,
    new.letter_id,
    reported_correspondence_id,
    'letter-report-operator/' || new.id::text,
    pg_catalog.jsonb_build_object(
      'reportId', new.id,
      'letterId', new.letter_id,
      'correspondenceId', reported_correspondence_id,
      'reporterId', new.reporter_id,
      'reporterEmail', reporter_email,
      'senderId', reported_sender_id,
      'category', new.category,
      'reportedAt', new.created_at
    )
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_letter_report_received()
from public, anon, authenticated;

drop trigger if exists letter_report_operator_notification on public.letter_reports;
create trigger letter_report_operator_notification
after insert on public.letter_reports
for each row execute function private.enqueue_letter_report_received();

-- This existing operator-only trigger function does not need to be callable
-- through the public Data API.
revoke all on function public.queue_privacy_operator_notification()
from public, anon, authenticated;
