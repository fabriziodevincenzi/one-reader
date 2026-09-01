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
    'letter_language_too_short',
    'letter_language_unsupported',
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

create or replace function public.reserve_opening_letter(
  p_correspondence_id uuid,
  p_letter_id uuid,
  p_sender_id uuid,
  p_provider_inbound_id text,
  p_subject text,
  p_language_code text,
  p_sender_alias_hash text,
  p_recipient_alias_hash text,
  p_content_ciphertext text,
  p_content_iv text,
  p_wrapped_dek text,
  p_content_key_version smallint,
  p_attachment_count smallint,
  p_source_message_id text
)
returns table (
  result text,
  correspondence_id uuid,
  letter_id uuid,
  recipient_id uuid,
  language_code text,
  next_available_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  sender_profile public.profiles%rowtype;
  chosen_recipient uuid;
  chosen_language text;
  last_opening_at timestamptz;
  cadence interval;
  today_utc date := (now() at time zone 'UTC')::date;
begin
  perform pg_advisory_xact_lock(hashtext('one-reader-opening-assignment'));

  select * into sender_profile
  from public.profiles
  where id = p_sender_id;

  if not found then
    return query select 'sender_not_found', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.account_status not in ('founding', 'free', 'annual') then
    return query select 'sender_inactive', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.email_verified_at is null then
    return query select 'sender_not_verified', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.service_eligible_at is null
    or sender_profile.adult_pool_eligible_at is null then
    return query select 'sender_profile_incomplete', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if sender_profile.service_eligible_at > today_utc then
    return query select 'sender_too_young', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  cadence := case
    when sender_profile.account_status in ('founding', 'annual') then interval '24 hours'
    else interval '90 days'
  end;

  select max(created_at) into last_opening_at
  from public.letters
  where sender_id = p_sender_id
    and kind = 'opening'
    and state not in ('failed');

  if last_opening_at is not null and last_opening_at + cadence > now() then
    return query select 'cadence_limited', null::uuid, null::uuid, null::uuid, null::text, last_opening_at + cadence;
    return;
  end if;

  with candidates as (
    select
      candidate.id,
      candidate_language.language_code,
      (
        select count(*)
        from public.letters recent_letter
        where recent_letter.recipient_id = candidate.id
          and recent_letter.kind = 'opening'
          and recent_letter.created_at >= now() - interval '30 days'
          and recent_letter.state not in ('failed')
      ) as received_last_30_days,
      exists (
        select 1
        from public.correspondences recent_pair
        where recent_pair.opened_at >= now() - interval '30 days'
          and (
            (recent_pair.starter_id = p_sender_id and recent_pair.recipient_id = candidate.id)
            or (recent_pair.starter_id = candidate.id and recent_pair.recipient_id = p_sender_id)
          )
      ) as is_recent_pair
    from public.profiles candidate
    join public.member_preferences preference on preference.user_id = candidate.id
    join public.member_languages candidate_language
      on candidate_language.user_id = candidate.id
     and candidate_language.language_code = p_language_code
    where candidate.id <> p_sender_id
      and candidate.account_status in ('founding', 'free', 'checkout_pending', 'annual')
      and candidate.email_verified_at is not null
      and candidate.service_eligible_at <= today_utc
      and candidate.adult_pool_eligible_at is not null
      and (candidate.adult_pool_eligible_at <= today_utc) = (sender_profile.adult_pool_eligible_at <= today_utc)
      and preference.is_available_to_receive
      and candidate_language.willing_to_read
      and not exists (
        select 1 from public.member_blocks block
        where (block.blocker_id = p_sender_id and block.blocked_id = candidate.id)
           or (block.blocker_id = candidate.id and block.blocked_id = p_sender_id)
      )
      and not exists (
        select 1 from public.letters today
        where today.recipient_id = candidate.id
          and today.kind = 'opening'
          and today.created_at >= now() - interval '24 hours'
          and today.state not in ('failed')
      )
  )
  select candidate.id, candidate.language_code
  into chosen_recipient, chosen_language
  from candidates candidate
  order by
    candidate.is_recent_pair asc,
    -ln(greatest(random(), 0.000000001)) * (1 + candidate.received_last_30_days) asc
  limit 1;

  if chosen_recipient is null then
    return query select 'no_candidate', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  insert into public.correspondences (
    id, starter_id, recipient_id, language_code, aliases_expires_at
  ) values (
    p_correspondence_id, p_sender_id, chosen_recipient, chosen_language, now() + interval '30 days'
  );

  insert into public.conversation_aliases (
    correspondence_id, permitted_sender_id, target_member_id, token_hash, expires_at
  ) values
    (p_correspondence_id, p_sender_id, chosen_recipient, p_sender_alias_hash, now() + interval '30 days'),
    (p_correspondence_id, chosen_recipient, p_sender_id, p_recipient_alias_hash, now() + interval '30 days');

  insert into public.letters (
    id,
    correspondence_id,
    sender_id,
    recipient_id,
    kind,
    subject,
    content_ciphertext,
    content_iv,
    wrapped_dek,
    content_key_version,
    attachment_count,
    provider_inbound_id,
    source_message_id
  ) values (
    p_letter_id,
    p_correspondence_id,
    p_sender_id,
    chosen_recipient,
    'opening',
    coalesce(nullif(left(p_subject, 240), ''), 'A letter for you'),
    p_content_ciphertext,
    p_content_iv,
    p_wrapped_dek,
    p_content_key_version,
    greatest(0, p_attachment_count),
    p_provider_inbound_id,
    p_source_message_id
  );

  return query select 'assigned', p_correspondence_id, p_letter_id, chosen_recipient, chosen_language, null::timestamptz;
end;
$$;
