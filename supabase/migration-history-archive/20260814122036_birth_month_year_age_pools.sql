alter table public.profiles
  add column if not exists birth_month smallint,
  add column if not exists birth_year smallint,
  add column if not exists birth_declared_at timestamptz,
  add column if not exists service_eligible_at date,
  add column if not exists adult_pool_eligible_at date;

alter table public.profiles
  add constraint profiles_birth_month_check
    check (birth_month is null or birth_month between 1 and 12),
  add constraint profiles_birth_year_check
    check (birth_year is null or birth_year between 1900 and 9999),
  add constraint profiles_birth_details_complete_check
    check (
      (birth_month is null and birth_year is null and birth_declared_at is null and service_eligible_at is null and adult_pool_eligible_at is null)
      or
      (birth_month is not null and birth_year is not null and birth_declared_at is not null and service_eligible_at is not null and adult_pool_eligible_at is not null)
    ),
  add constraint profiles_age_eligibility_order_check
    check (
      service_eligible_at is null
      or adult_pool_eligible_at > service_eligible_at
    );

create index if not exists profiles_age_pool_eligibility_idx
  on public.profiles (service_eligible_at, adult_pool_eligible_at)
  where service_eligible_at is not null;

create or replace function public.set_birth_month_year(
  p_birth_month smallint,
  p_birth_year smallint
)
returns table (
  service_eligible_at date,
  adult_pool_eligible_at date,
  age_pool text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
  today_utc date := (now() at time zone 'UTC')::date;
  minimum_date date;
  adult_date date;
  saved_profile public.profiles%rowtype;
begin
  if member_id is null then
    raise exception 'authentication_required';
  end if;

  if p_birth_month is null or p_birth_month not between 1 and 12 then
    raise exception 'invalid_birth_month';
  end if;

  if p_birth_year is null
    or p_birth_year < extract(year from today_utc)::integer - 120
    or p_birth_year > extract(year from today_utc)::integer then
    raise exception 'invalid_birth_year';
  end if;

  -- Without a day of birth, eligibility starts on the first day after the
  -- birth month. This deliberately avoids placing someone in an older pool
  -- before every possible birthday in that month has passed.
  minimum_date := (make_date(p_birth_year + 14, p_birth_month, 1) + interval '1 month')::date;
  adult_date := (make_date(p_birth_year + 18, p_birth_month, 1) + interval '1 month')::date;

  if minimum_date > today_utc then
    raise exception 'minimum_age_not_met';
  end if;

  update public.profiles
  set birth_month = p_birth_month,
      birth_year = p_birth_year,
      birth_declared_at = now(),
      service_eligible_at = minimum_date,
      adult_pool_eligible_at = adult_date,
      updated_at = now()
  where id = member_id
    and birth_month is null
    and birth_year is null
  returning * into saved_profile;

  if not found then
    select * into saved_profile
    from public.profiles
    where id = member_id;

    if not found then
      raise exception 'profile_not_found';
    end if;

    if saved_profile.birth_month is distinct from p_birth_month
      or saved_profile.birth_year is distinct from p_birth_year then
      raise exception 'birth_details_locked';
    end if;
  end if;

  return query select
    saved_profile.service_eligible_at,
    saved_profile.adult_pool_eligible_at,
    case when saved_profile.adult_pool_eligible_at <= today_utc then 'adult' else 'minor' end;
end;
$$;

revoke all on function public.set_birth_month_year(smallint, smallint) from public, anon;
grant execute on function public.set_birth_month_year(smallint, smallint) to authenticated, service_role;

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
      sender_language.language_code,
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
    join public.member_languages candidate_language on candidate_language.user_id = candidate.id
    join public.member_languages sender_language
      on sender_language.user_id = p_sender_id
     and sender_language.language_code = candidate_language.language_code
    where candidate.id <> p_sender_id
      and candidate.account_status in ('founding', 'free', 'annual')
      and candidate.email_verified_at is not null
      and candidate.service_eligible_at <= today_utc
      and candidate.adult_pool_eligible_at is not null
      and (candidate.adult_pool_eligible_at <= today_utc) = (sender_profile.adult_pool_eligible_at <= today_utc)
      and preference.is_available_to_receive
      and sender_language.proficiency in ('good', 'fluent', 'native')
      and candidate_language.proficiency in ('good', 'fluent', 'native')
      and sender_language.willing_to_write
      and candidate_language.willing_to_read
      and (p_language_code is null or sender_language.language_code = p_language_code)
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

revoke all on function public.reserve_opening_letter(uuid, uuid, uuid, text, text, text, text, text, text, text, text, smallint, smallint, text) from public, anon, authenticated;
grant execute on function public.reserve_opening_letter(uuid, uuid, uuid, text, text, text, text, text, text, text, text, smallint, smallint, text) to service_role;
