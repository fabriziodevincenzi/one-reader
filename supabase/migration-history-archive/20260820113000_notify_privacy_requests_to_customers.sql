create or replace function public.queue_privacy_operator_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.request_type in ('access', 'rectification') then
    insert into public.transactional_email_outbox (
      event_type, recipient_email, member_id, dedupe_key, payload
    )
    select
      'privacy_request_received',
      'customers@onereader.co',
      new.user_id,
      'privacy-operator/' || new.id,
      jsonb_build_object('requestId', new.id, 'requestType', new.request_type, 'requestedAt', new.created_at, 'operatorNotification', true)
    where exists (select 1 from public.profiles p where p.id = new.user_id)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists privacy_request_operator_notification on public.privacy_requests;
create trigger privacy_request_operator_notification
after insert on public.privacy_requests
for each row execute function public.queue_privacy_operator_notification();
