create table if not exists public.account_deletion_receipts (
  request_id uuid primary key,
  requested_at timestamptz not null,
  completed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

alter table public.account_deletion_receipts enable row level security;

revoke all on table public.account_deletion_receipts from public, anon, authenticated;
grant select, insert, delete on table public.account_deletion_receipts to service_role;

create index if not exists privacy_requests_deletion_retention_idx
  on public.privacy_requests (created_at, user_id)
  where request_type = 'deletion' and status in ('requested', 'in_progress');

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'account-deletion-worker-daily',
  'account-deletion-receipt-cleanup-daily'
);

select cron.schedule(
  'account-deletion-worker-daily',
  '30 3 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
      ) || '/functions/v1/account-deletion-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'transactional_worker_token'
        )
      ),
      body := jsonb_build_object('source', 'cron', 'scheduled_at', now()),
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);

select cron.schedule(
  'account-deletion-receipt-cleanup-daily',
  '45 3 * * *',
  $job$
    delete from public.account_deletion_receipts
    where expires_at <= now();
  $job$
);
