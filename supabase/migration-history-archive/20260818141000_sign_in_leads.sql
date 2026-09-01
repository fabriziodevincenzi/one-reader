create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email_address text not null unique
    check (email_address = lower(btrim(email_address)) and length(email_address) between 3 and 320 and position('@' in email_address) > 1),
  source text not null default 'sign_in'
    check (source in ('sign_in')),
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

create policy "leads_insert_only"
  on public.leads for insert
  to anon, authenticated
  with check (true);

revoke all on table public.leads from anon, authenticated;
grant insert on table public.leads to anon, authenticated;
revoke all on table public.leads from public;
