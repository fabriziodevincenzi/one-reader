create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_status text not null default 'pending_email'
    check (account_status in ('pending_email', 'waitlisted', 'free', 'checkout_pending', 'annual', 'delivery_paused', 'closed')),
  plan text not null default 'free'
    check (plan in ('free', 'annual')),
  waitlist_joined_at timestamptz,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  market_currency text,
  language_code text not null default 'en',
  is_available_to_receive boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  source text not null default 'public',
  status text not null default 'active'
    check (status in ('active', 'converted', 'removed')),
  joined_at timestamptz not null default now(),
  converted_at timestamptz
);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null
    check (purpose in ('terms', 'waitlist_operational', 'journal_marketing', 'privacy_acknowledgement')),
  granted boolean not null,
  policy_version text not null,
  consent_text text not null,
  source text not null default 'signup',
  created_at timestamptz not null default now()
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null
    check (request_type in ('access', 'rectification', 'deletion')),
  status text not null default 'requested'
    check (status in ('requested', 'in_progress', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.member_preferences enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.consent_events enable row level security;
alter table public.privacy_requests enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "preferences_select_own"
  on public.member_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "preferences_insert_own"
  on public.member_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "preferences_update_own"
  on public.member_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "waitlist_select_own"
  on public.waitlist_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "consents_select_own"
  on public.consent_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "consents_insert_own"
  on public.consent_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "privacy_requests_select_own"
  on public.privacy_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "privacy_requests_insert_own"
  on public.privacy_requests for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.member_preferences, public.waitlist_entries, public.consent_events, public.privacy_requests from anon;
revoke all on table public.profiles, public.member_preferences, public.waitlist_entries, public.consent_events, public.privacy_requests from authenticated;

grant select on table public.profiles to authenticated;
grant select, insert, update on table public.member_preferences to authenticated;
grant select on table public.waitlist_entries to authenticated;
grant select, insert on table public.consent_events to authenticated;
grant select, insert on table public.privacy_requests to authenticated;

grant all on table public.profiles, public.member_preferences, public.waitlist_entries, public.consent_events, public.privacy_requests to service_role;
