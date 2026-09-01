create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('withdrawal_14_day', 'service_issue', 'goodwill')),
  reason text not null check (char_length(reason) between 10 and 2000),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'requested' check (status in ('requested', 'in_review', 'approved', 'rejected', 'refunded')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz
);

alter table public.refund_requests enable row level security;
create policy "refund_requests_select_own"
  on public.refund_requests for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.refund_requests from anon, authenticated;
grant select on table public.refund_requests to authenticated;
grant all on table public.refund_requests to service_role;
