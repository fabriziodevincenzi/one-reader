-- Keep the newest active deletion request and supersede older accidental duplicates.
with ranked_requests as (
  select
    id,
    row_number() over (partition by user_id order by created_at desc, id desc) as request_rank
  from public.privacy_requests
  where request_type = 'deletion'
    and status in ('requested', 'in_progress')
)
update public.privacy_requests as request
set status = 'rejected',
    completed_at = now()
from ranked_requests
where request.id = ranked_requests.id
  and ranked_requests.request_rank > 1;

-- Do not send confirmation emails for requests that have just been superseded.
update public.transactional_email_outbox as email
set status = 'cancelled',
    processed_at = now(),
    last_error = 'Superseded duplicate deletion request'
where email.dedupe_key like 'privacy-request/%'
  and email.status in ('pending', 'retry', 'processing')
  and exists (
    select 1
    from public.privacy_requests as request
    where 'privacy-request/' || request.id::text = email.dedupe_key
      and request.request_type = 'deletion'
      and request.status = 'rejected'
  );

create unique index if not exists privacy_requests_one_active_deletion_per_user
  on public.privacy_requests (user_id)
  where request_type = 'deletion'
    and status in ('requested', 'in_progress');
