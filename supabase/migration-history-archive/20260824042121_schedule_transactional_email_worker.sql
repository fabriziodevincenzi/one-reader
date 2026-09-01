create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret(
      'https://xgkvabldnznbyinvozfb.supabase.co',
      'project_url',
      'One Reader Supabase project URL for scheduled Edge Functions'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'transactional_worker_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'transactional_worker_token',
      'Dedicated bearer token for the scheduled transactional email worker'
    );
  end if;
end;
$$;

create or replace function public.verify_transactional_worker_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_token <> '' and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'transactional_worker_token'
        and decrypted_secret = p_token
    ),
    false
  );
$$;

revoke all on function public.verify_transactional_worker_token(text)
from public, anon, authenticated;
grant execute on function public.verify_transactional_worker_token(text)
to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'transactional-email-worker-daily';

select cron.schedule(
  'transactional-email-worker-daily',
  '0 6 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
      ) || '/functions/v1/transactional-worker',
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
