alter table public.transactional_email_outbox
  alter column recipient_email drop not null,
  drop constraint transactional_email_outbox_recipient_email_check,
  add constraint transactional_email_outbox_recipient_email_check
    check (
      recipient_email is null
      or (
        recipient_email = lower(btrim(recipient_email))
        and length(recipient_email) between 3 and 320
        and position('@' in recipient_email) > 1
      )
    );

create or replace function public.complete_transactional_email(
  p_email_id uuid,
  p_provider_outbound_id text,
  p_rendered_subject text,
  p_rendered_html text,
  p_rendered_text text,
  p_preview boolean default false
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.transactional_email_outbox
  set status = case when p_preview then 'previewed' else 'sent' end,
      recipient_email = case when event_type = 'unknown_sender' then null else recipient_email end,
      locked_until = null,
      provider_outbound_id = p_provider_outbound_id,
      rendered_subject = p_rendered_subject,
      rendered_html = p_rendered_html,
      rendered_text = p_rendered_text,
      last_error = null,
      processed_at = now()
  where id = p_email_id;
$$;

revoke all on function public.complete_transactional_email(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_transactional_email(uuid, text, text, text, text, boolean) to service_role;
