create table public.transactional_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
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
      'privacy_request_received'
    )),
  recipient_email text not null
    check (
      recipient_email = lower(btrim(recipient_email))
      and length(recipient_email) between 3 and 320
      and position('@' in recipient_email) > 1
    ),
  member_id uuid references public.profiles(id) on delete set null,
  letter_id uuid references public.letters(id) on delete set null,
  correspondence_id uuid references public.correspondences(id) on delete set null,
  dedupe_key text not null unique check (length(dedupe_key) between 1 and 500),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'previewed', 'sent', 'dead', 'cancelled')),
  attempts smallint not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  provider_outbound_id text,
  rendered_subject text,
  rendered_html text,
  rendered_text text,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index transactional_email_outbox_available_idx
  on public.transactional_email_outbox (available_at, created_at)
  where status in ('pending', 'retry', 'processing');

create index transactional_email_outbox_member_idx
  on public.transactional_email_outbox (member_id, created_at desc)
  where member_id is not null;

alter table public.transactional_email_outbox enable row level security;

create policy "backend_only_no_member_access"
  on public.transactional_email_outbox for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.transactional_email_outbox from anon, authenticated;
grant all on table public.transactional_email_outbox to service_role;

create or replace function public.claim_transactional_emails(p_limit integer default 10)
returns setof public.transactional_email_outbox
language sql
security invoker
set search_path = public, pg_temp
as $$
  with claimable as (
    select id
    from public.transactional_email_outbox
    where available_at <= now()
      and (
        status in ('pending', 'retry')
        or (status = 'processing' and locked_until < now())
      )
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.transactional_email_outbox as email
  set status = 'processing',
      attempts = email.attempts + 1,
      locked_until = now() + interval '2 minutes'
  from claimable
  where email.id = claimable.id
  returning email.*;
$$;

create or replace function public.complete_transactional_email(
  p_email_id uuid,
  p_provider_outbound_id text,
  p_rendered_subject text,
  p_rendered_html text,
  p_rendered_text text,
  p_preview boolean default false
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.transactional_email_outbox
  set status = case when p_preview then 'previewed' else 'sent' end,
      locked_until = null,
      provider_outbound_id = p_provider_outbound_id,
      rendered_subject = p_rendered_subject,
      rendered_html = p_rendered_html,
      rendered_text = p_rendered_text,
      last_error = null,
      processed_at = now()
  where id = p_email_id;
$$;

create or replace function public.retry_transactional_email(
  p_email_id uuid,
  p_error text,
  p_delay_seconds integer default 60,
  p_max_attempts integer default 8
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.transactional_email_outbox
  set status = case when attempts >= greatest(1, p_max_attempts) then 'dead' else 'retry' end,
      available_at = now() + make_interval(secs => greatest(1, least(p_delay_seconds, 86400))),
      locked_until = null,
      last_error = left(coalesce(p_error, 'Unknown processing error'), 2000),
      processed_at = case when attempts >= greatest(1, p_max_attempts) then now() else null end
  where id = p_email_id;
$$;

revoke all on function public.claim_transactional_emails(integer) from public, anon, authenticated;
revoke all on function public.complete_transactional_email(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.retry_transactional_email(uuid, text, integer, integer) from public, anon, authenticated;

grant execute on function public.claim_transactional_emails(integer) to service_role;
grant execute on function public.complete_transactional_email(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.retry_transactional_email(uuid, text, integer, integer) to service_role;

create or replace function private.enqueue_privacy_request_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_email text;
begin
  select profile.email_address
    into member_email
  from public.profiles as profile
  where profile.id = new.user_id;

  if member_email is not null then
    insert into public.transactional_email_outbox (
      event_type,
      recipient_email,
      member_id,
      dedupe_key,
      payload
    ) values (
      'privacy_request_received',
      member_email,
      new.user_id,
      'privacy-request/' || new.id::text,
      pg_catalog.jsonb_build_object(
        'requestId', new.id,
        'requestType', new.request_type,
        'requestedAt', new.created_at
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.enqueue_privacy_request_received() from public, anon, authenticated;

create trigger privacy_request_transactional_email
  after insert on public.privacy_requests
  for each row execute function private.enqueue_privacy_request_received();
