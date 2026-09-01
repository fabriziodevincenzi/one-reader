alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('pending_email', 'waitlisted', 'founding', 'free', 'checkout_pending', 'annual', 'delivery_paused', 'closed'));

alter table public.profiles
  add column if not exists founding_season_ends_at timestamptz,
  add column if not exists subscription_renews_at timestamptz;

create table public.member_languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  language_code text not null check (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  proficiency text not null check (proficiency in ('basic', 'good', 'fluent', 'native')),
  sort_order smallint not null default 0 check (sort_order between 0 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, language_code)
);

create table public.member_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  correspondences_started_count integer not null default 0 check (correspondences_started_count >= 0),
  correspondences_open_count integer not null default 0 check (correspondences_open_count >= 0),
  last_letter_sent_at timestamptz,
  last_letter_received_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.member_languages enable row level security;
alter table public.member_stats enable row level security;

create policy "member_languages_select_own"
  on public.member_languages for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "member_languages_insert_own"
  on public.member_languages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "member_languages_update_own"
  on public.member_languages for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "member_languages_delete_own"
  on public.member_languages for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "member_stats_select_own"
  on public.member_stats for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.member_languages, public.member_stats from anon;
revoke all on table public.member_languages, public.member_stats from authenticated;

grant select, insert, update, delete on table public.member_languages to authenticated;
grant select on table public.member_stats to authenticated;
grant all on table public.member_languages, public.member_stats to service_role;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.enforce_member_language_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.member_languages where user_id = new.user_id) >= 10 then
    raise exception 'language limit reached';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_member_language_limit() from public, anon, authenticated;

create trigger member_languages_limit_trigger
  before insert on public.member_languages
  for each row execute function private.enforce_member_language_limit();

insert into public.member_languages (user_id, language_code, proficiency, sort_order)
select user_id, language_code, 'good', 0
from public.member_preferences
where language_code is not null
on conflict (user_id, language_code) do nothing;

insert into public.member_stats (user_id)
select id from public.profiles
on conflict (user_id) do nothing;
