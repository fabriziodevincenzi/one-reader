alter table public.profiles
  add column if not exists email_address text,
  add column if not exists adult_confirmed_at timestamptz,
  add column if not exists consecutive_unredeemed_magic_links smallint not null default 0
    check (consecutive_unredeemed_magic_links >= 0),
  add column if not exists last_magic_link_redeemed_at timestamptz,
  add column if not exists last_meaningful_email_activity_at timestamptz;

update public.profiles as profile
set email_address = lower(auth_user.email)
from auth.users as auth_user
where auth_user.id = profile.id
  and auth_user.email is not null
  and profile.email_address is null;

create unique index if not exists profiles_email_address_unique
  on public.profiles (lower(email_address))
  where email_address is not null;

alter table public.member_languages
  add column if not exists willing_to_write boolean not null default true,
  add column if not exists willing_to_read boolean not null default true;

create table public.correspondences (
  id uuid primary key,
  starter_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  language_code text not null check (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  status text not null default 'assigned'
    check (status in ('assigned', 'delivered', 'open', 'stopped', 'reported', 'direct', 'expired')),
  opened_at timestamptz not null default now(),
  last_exchange_at timestamptz not null default now(),
  aliases_expires_at timestamptz not null default (now() + interval '30 days'),
  starter_continue_requested_at timestamptz,
  recipient_continue_requested_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starter_id <> recipient_id)
);

create table public.conversation_aliases (
  id uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondences(id) on delete cascade,
  permitted_sender_id uuid not null references public.profiles(id) on delete restrict,
  target_member_id uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  key_version smallint not null default 1 check (key_version > 0),
  active boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (correspondence_id, permitted_sender_id),
  check (permitted_sender_id <> target_member_id)
);

create table public.letters (
  id uuid primary key,
  correspondence_id uuid not null references public.correspondences(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('opening', 'reply', 'system')),
  state text not null default 'assigned'
    check (state in ('assigned', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'stopped', 'reported')),
  subject text not null default 'A letter for you',
  content_ciphertext text not null,
  content_iv text not null,
  wrapped_dek text not null,
  content_key_version smallint not null default 1 check (content_key_version > 0),
  attachment_count smallint not null default 0 check (attachment_count >= 0),
  provider_inbound_id text not null unique,
  source_message_id text,
  provider_outbound_id text unique,
  delivered_at timestamptz,
  bounced_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create table public.member_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  correspondence_id uuid references public.correspondences(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.letter_reports (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text,
  details_ciphertext text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.email_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_event_id text not null,
  provider_email_id text,
  event_type text not null,
  status text not null default 'received'
    check (status in ('received', 'queued', 'processed', 'ignored', 'failed')),
  failure_reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table public.mail_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('process_inbound', 'send_letter', 'send_notice')),
  provider_event_id uuid references public.email_provider_events(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'completed', 'dead')),
  attempts smallint not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (kind, provider_event_id)
);

create index correspondences_starter_opened_idx
  on public.correspondences (starter_id, opened_at desc);
create index correspondences_recipient_opened_idx
  on public.correspondences (recipient_id, opened_at desc);
create index correspondences_pair_recent_idx
  on public.correspondences (starter_id, recipient_id, opened_at desc);
create index conversation_aliases_lookup_idx
  on public.conversation_aliases (token_hash)
  where active;
create index letters_recipient_opening_idx
  on public.letters (recipient_id, created_at desc)
  where kind = 'opening';
create index letters_sender_opening_idx
  on public.letters (sender_id, created_at desc)
  where kind = 'opening';
create index letters_correspondence_created_idx
  on public.letters (correspondence_id, created_at);
create index member_blocks_reverse_idx
  on public.member_blocks (blocked_id, blocker_id);
create index mail_jobs_available_idx
  on public.mail_jobs (available_at, id)
  where status in ('pending', 'retry', 'processing');

alter table public.correspondences enable row level security;
alter table public.conversation_aliases enable row level security;
alter table public.letters enable row level security;
alter table public.member_blocks enable row level security;
alter table public.letter_reports enable row level security;
alter table public.email_provider_events enable row level security;
alter table public.mail_jobs enable row level security;

revoke all on table
  public.correspondences,
  public.conversation_aliases,
  public.letters,
  public.member_blocks,
  public.letter_reports,
  public.email_provider_events,
  public.mail_jobs
from anon, authenticated;

grant all on table
  public.correspondences,
  public.conversation_aliases,
  public.letters,
  public.member_blocks,
  public.letter_reports,
  public.email_provider_events,
  public.mail_jobs
to service_role;

grant usage, select on sequence public.mail_jobs_id_seq to service_role;

create or replace function public.claim_mail_jobs(p_limit integer default 5)
returns setof public.mail_jobs
language sql
security invoker
set search_path = public, pg_temp
as $$
  with claimable as (
    select id
    from public.mail_jobs
    where available_at <= now()
      and (
        status in ('pending', 'retry')
        or (status = 'processing' and locked_until < now())
      )
    order by available_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.mail_jobs as job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_until = now() + interval '2 minutes'
  from claimable
  where job.id = claimable.id
  returning job.*;
$$;

create or replace function public.complete_mail_job(p_job_id bigint)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.mail_jobs
  set status = 'completed',
      locked_until = null,
      completed_at = now(),
      last_error = null
  where id = p_job_id;
$$;

create or replace function public.retry_mail_job(
  p_job_id bigint,
  p_error text,
  p_delay_seconds integer default 60,
  p_max_attempts integer default 8
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.mail_jobs
  set status = case when attempts >= greatest(1, p_max_attempts) then 'dead' else 'retry' end,
      available_at = now() + make_interval(secs => greatest(1, least(p_delay_seconds, 86400))),
      locked_until = null,
      last_error = left(coalesce(p_error, 'Unknown processing error'), 2000)
  where id = p_job_id;
$$;

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
begin
  -- The launch pool is deliberately small. Serializing assignments prevents
  -- two simultaneous letters from consuming the same recipient daily slot.
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

  if sender_profile.email_verified_at is null or sender_profile.adult_confirmed_at is null then
    return query select 'sender_not_verified', null::uuid, null::uuid, null::uuid, null::text, null::timestamptz;
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
      and candidate.adult_confirmed_at is not null
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

create or replace function public.reserve_reply_letter(
  p_letter_id uuid,
  p_alias_hash text,
  p_sender_id uuid,
  p_provider_inbound_id text,
  p_subject text,
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
  language_code text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  route public.conversation_aliases%rowtype;
  conversation public.correspondences%rowtype;
begin
  select * into route
  from public.conversation_aliases
  where token_hash = p_alias_hash
  for update;

  if not found or not route.active or route.permitted_sender_id <> p_sender_id then
    return query select 'invalid_alias', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  select * into conversation
  from public.correspondences
  where id = route.correspondence_id
  for update;

  if conversation.status in ('stopped', 'reported', 'direct', 'expired')
     or route.expires_at <= now() then
    update public.conversation_aliases
    set active = false
    where correspondence_id = route.correspondence_id;
    return query select 'conversation_closed', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1 from public.member_blocks block
    where (block.blocker_id = p_sender_id and block.blocked_id = route.target_member_id)
       or (block.blocker_id = route.target_member_id and block.blocked_id = p_sender_id)
  ) then
    return query select 'conversation_blocked', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

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
    route.correspondence_id,
    p_sender_id,
    route.target_member_id,
    'reply',
    coalesce(nullif(left(p_subject, 240), ''), 'Re: A letter for you'),
    p_content_ciphertext,
    p_content_iv,
    p_wrapped_dek,
    p_content_key_version,
    greatest(0, p_attachment_count),
    p_provider_inbound_id,
    p_source_message_id
  );

  update public.correspondences
  set status = 'open',
      last_exchange_at = now(),
      aliases_expires_at = now() + interval '30 days',
      updated_at = now()
  where id = route.correspondence_id;

  update public.conversation_aliases
  set active = true,
      expires_at = now() + interval '30 days'
  where correspondence_id = route.correspondence_id;

  return query
    select 'assigned', route.correspondence_id, p_letter_id, route.target_member_id, conversation.language_code;
end;
$$;

create or replace function public.record_letter_sent(
  p_letter_id uuid,
  p_provider_outbound_id text
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.letters
  set state = 'sent',
      provider_outbound_id = p_provider_outbound_id,
      failure_reason = null,
      updated_at = now()
  where id = p_letter_id;
$$;

create or replace function public.record_provider_delivery(
  p_provider_outbound_id text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  delivered_letter public.letters%rowtype;
begin
  select * into delivered_letter
  from public.letters
  where provider_outbound_id = p_provider_outbound_id
  for update;

  if not found then return; end if;

  if delivered_letter.state = 'delivered' then return; end if;

  update public.letters
  set state = 'delivered',
      delivered_at = coalesce(delivered_at, now()),
      failure_reason = null,
      updated_at = now()
  where id = delivered_letter.id;

  update public.correspondences
  set status = case when status = 'assigned' then 'delivered' else status end,
      last_exchange_at = now(),
      updated_at = now()
  where id = delivered_letter.correspondence_id;

  insert into public.member_stats (user_id, correspondences_started_count, correspondences_open_count, last_letter_sent_at, updated_at)
  values (
    delivered_letter.sender_id,
    case when delivered_letter.kind = 'opening' then 1 else 0 end,
    case when delivered_letter.kind = 'reply' then 1 else 0 end,
    now(),
    now()
  )
  on conflict (user_id) do update
  set correspondences_started_count = public.member_stats.correspondences_started_count
      + case when delivered_letter.kind = 'opening' then 1 else 0 end,
      correspondences_open_count = greatest(
        public.member_stats.correspondences_open_count,
        case when delivered_letter.kind = 'reply' then 1 else 0 end
      ),
      last_letter_sent_at = now(),
      updated_at = now();

  insert into public.member_stats (user_id, last_letter_received_at, updated_at)
  values (delivered_letter.recipient_id, now(), now())
  on conflict (user_id) do update
  set last_letter_received_at = now(), updated_at = now();
end;
$$;

create or replace function public.record_letter_failure(
  p_letter_id uuid,
  p_reason text,
  p_bounced boolean default false
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.letters
  set state = case when p_bounced then 'bounced' else 'failed' end,
      bounced_at = case when p_bounced then now() else bounced_at end,
      failure_reason = left(coalesce(p_reason, 'Delivery failed'), 2000),
      updated_at = now()
  where id = p_letter_id;
$$;

create or replace function public.record_provider_bounce(
  p_provider_outbound_id text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.letters
  set state = 'bounced',
      bounced_at = coalesce(bounced_at, now()),
      failure_reason = left(coalesce(p_reason, 'Delivery bounced'), 2000),
      updated_at = now()
  where provider_outbound_id = p_provider_outbound_id;
$$;

revoke all on function public.claim_mail_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_mail_job(bigint) from public, anon, authenticated;
revoke all on function public.retry_mail_job(bigint, text, integer, integer) from public, anon, authenticated;
revoke all on function public.reserve_opening_letter(uuid, uuid, uuid, text, text, text, text, text, text, text, text, smallint, smallint, text) from public, anon, authenticated;
revoke all on function public.reserve_reply_letter(uuid, text, uuid, text, text, text, text, text, smallint, smallint, text) from public, anon, authenticated;
revoke all on function public.record_letter_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.record_provider_delivery(text) from public, anon, authenticated;
revoke all on function public.record_letter_failure(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.record_provider_bounce(text, text) from public, anon, authenticated;

grant execute on function public.claim_mail_jobs(integer) to service_role;
grant execute on function public.complete_mail_job(bigint) to service_role;
grant execute on function public.retry_mail_job(bigint, text, integer, integer) to service_role;
grant execute on function public.reserve_opening_letter(uuid, uuid, uuid, text, text, text, text, text, text, text, text, smallint, smallint, text) to service_role;
grant execute on function public.reserve_reply_letter(uuid, text, uuid, text, text, text, text, text, smallint, smallint, text) to service_role;
grant execute on function public.record_letter_sent(uuid, text) to service_role;
grant execute on function public.record_provider_delivery(text) to service_role;
grant execute on function public.record_letter_failure(uuid, text, boolean) to service_role;
grant execute on function public.record_provider_bounce(text, text) to service_role;
