create table if not exists public.opening_attempts (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  result text not null check (result in ('cadence_limited')),
  attempted_at timestamptz not null default now()
);

create index if not exists opening_attempts_sender_time_idx
  on public.opening_attempts (sender_id, attempted_at desc);

alter table public.opening_attempts enable row level security;
revoke all on table public.opening_attempts from anon, authenticated;
grant all on table public.opening_attempts to service_role;

-- People who joined during the waitlist phase keep their account and become
-- ordinary Free members as soon as the service opens.
update public.profiles
set account_status = 'free', updated_at = now()
where account_status = 'waitlisted';

update public.waitlist_entries
set status = 'converted', converted_at = coalesce(converted_at, now())
where status = 'active';

-- Keep only the minimum operational signal needed for the second-attempt
-- upgrade reminder; the rejected letter body is never stored.
create or replace function public.record_free_cadence_attempt(
  p_sender_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_count integer;
begin
  insert into public.opening_attempts (sender_id, result) values (p_sender_id, 'cadence_limited');
  select count(*)::integer into attempt_count
  from public.opening_attempts
  where sender_id = p_sender_id
    and attempted_at >= now() - interval '90 days';
  return attempt_count;
end;
$$;

revoke all on function public.record_free_cadence_attempt(uuid) from public, anon, authenticated;
grant execute on function public.record_free_cadence_attempt(uuid) to service_role;
