-- Privacy-first product analytics. Raw events stay in the private schema and
-- are writable only through the server-side RPC below.
create table if not exists private.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in (
    'signup_started',
    'signup_completed',
    'email_verified',
    'first_letter_sent',
    'reply_received',
    'subscription_started',
    'subscription_cancelled'
  )),
  occurred_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  source text null check (source is null or source in ('direct', 'organic', 'referral', 'campaign', 'product')),
  campaign text null,
  metadata jsonb not null default '{}'::jsonb
);

alter table private.analytics_events enable row level security;

create index if not exists analytics_events_occurred_at_idx
  on private.analytics_events (occurred_at desc);
create index if not exists analytics_events_name_occurred_at_idx
  on private.analytics_events (event_name, occurred_at desc);

create or replace function public.record_analytics_event(
  p_event_name text,
  p_user_id uuid default null,
  p_source text default null,
  p_campaign text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into private.analytics_events (event_name, user_id, source, campaign, metadata)
  values (
    p_event_name,
    p_user_id,
    nullif(p_source, ''),
    nullif(left(p_campaign, 100), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_analytics_event(text, uuid, text, text, jsonb) from public;
grant execute on function public.record_analytics_event(text, uuid, text, text, jsonb) to service_role;

create or replace view private.analytics_daily as
select
  date_trunc('day', occurred_at)::date as day,
  event_name,
  coalesce(source, 'unknown') as source,
  count(*)::integer as events
from private.analytics_events
group by 1, 2, 3;

create or replace view private.analytics_signup_funnel as
select
  count(*) filter (where event_name = 'signup_completed')::integer as signup_completed,
  count(*) filter (where event_name = 'email_verified')::integer as email_verified,
  count(*) filter (where event_name = 'first_letter_sent')::integer as first_letter_sent,
  count(*) filter (where event_name = 'subscription_started')::integer as subscription_started
from private.analytics_events;
