alter table public.profiles
  add column if not exists subscription_current_period_start timestamptz;
