create or replace function public.reserve_reply_letter(
  p_letter_id uuid,
  p_alias_hash text,
  p_sender_id uuid,
  p_provider_inbound_id text,
  p_subject text,
  p_content_ciphertext text,
  p_content_iv text,
  p_wrapped_dek text,
  p_content_key_version smallint,
  p_attachment_count smallint,
  p_source_message_id text
)
returns table (
  result text,
  correspondence_id uuid,
  letter_id uuid,
  recipient_id uuid,
  language_code text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  route public.conversation_aliases%rowtype;
  conversation public.correspondences%rowtype;
begin
  select * into route
  from public.conversation_aliases
  where token_hash = p_alias_hash
  for update;

  if not found or not route.active or route.permitted_sender_id <> p_sender_id then
    return query select 'invalid_alias', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  select * into conversation
  from public.correspondences
  where id = route.correspondence_id
  for update;

  if conversation.status in ('stopped', 'reported', 'direct', 'expired')
     or route.expires_at <= now() then
    update public.conversation_aliases as aliases
    set active = false
    where aliases.correspondence_id = route.correspondence_id;
    return query select 'conversation_closed', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1 from public.member_blocks as block
    where (block.blocker_id = p_sender_id and block.blocked_id = route.target_member_id)
       or (block.blocker_id = route.target_member_id and block.blocked_id = p_sender_id)
  ) then
    return query select 'conversation_blocked', null::uuid, null::uuid, null::uuid, null::text;
    return;
  end if;

  insert into public.letters (
    id,
    correspondence_id,
    sender_id,
    recipient_id,
    kind,
    subject,
    content_ciphertext,
    content_iv,
    wrapped_dek,
    content_key_version,
    attachment_count,
    provider_inbound_id,
    source_message_id
  ) values (
    p_letter_id,
    route.correspondence_id,
    p_sender_id,
    route.target_member_id,
    'reply',
    coalesce(nullif(left(p_subject, 240), ''), 'Re: A letter for you'),
    p_content_ciphertext,
    p_content_iv,
    p_wrapped_dek,
    p_content_key_version,
    greatest(0, p_attachment_count),
    p_provider_inbound_id,
    p_source_message_id
  );

  update public.correspondences
  set status = 'open',
      last_exchange_at = now(),
      aliases_expires_at = now() + interval '30 days',
      updated_at = now()
  where id = route.correspondence_id;

  update public.conversation_aliases as aliases
  set active = true,
      expires_at = now() + interval '30 days'
  where aliases.correspondence_id = route.correspondence_id;

  return query
    select 'assigned', route.correspondence_id, p_letter_id, route.target_member_id, conversation.language_code;
end;
$$;
