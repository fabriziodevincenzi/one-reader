create unique index if not exists letter_reports_letter_reporter_unique
  on public.letter_reports (letter_id, reporter_id);

create or replace function public.apply_letter_action(
  p_letter_id uuid,
  p_actor_id uuid,
  p_action text,
  p_category text default null
)
returns table (
  result text,
  correspondence_status text,
  report_id uuid
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_letter public.letters%rowtype;
  v_correspondence public.correspondences%rowtype;
  v_report_id uuid;
begin
  if p_action not in ('stop', 'report') then
    result := 'invalid_action';
    return next;
    return;
  end if;

  if p_action = 'report' and coalesce(p_category, '') not in (
    'sexual_explicit',
    'harassment_threats',
    'hate_discrimination',
    'personal_data',
    'spam_fraud',
    'other'
  ) then
    result := 'invalid_category';
    return next;
    return;
  end if;

  select *
  into v_letter
  from public.letters
  where id = p_letter_id
  for update;

  if not found then
    result := 'letter_not_found';
    return next;
    return;
  end if;

  if v_letter.recipient_id <> p_actor_id then
    result := 'not_recipient';
    return next;
    return;
  end if;

  select *
  into v_correspondence
  from public.correspondences
  where id = v_letter.correspondence_id
  for update;

  if not found then
    result := 'letter_not_found';
    return next;
    return;
  end if;

  insert into public.member_blocks (
    blocker_id,
    blocked_id,
    correspondence_id,
    reason
  ) values (
    p_actor_id,
    v_letter.sender_id,
    v_letter.correspondence_id,
    case when p_action = 'report' then 'reported_letter' else 'correspondence_stopped' end
  )
  on conflict (blocker_id, blocked_id) do update
  set correspondence_id = excluded.correspondence_id,
      reason = case
        when public.member_blocks.reason = 'reported_letter' then public.member_blocks.reason
        else excluded.reason
      end;

  update public.conversation_aliases
  set active = false
  where correspondence_id = v_letter.correspondence_id
    and active;

  if p_action = 'report' then
    insert into public.letter_reports (
      letter_id,
      reporter_id,
      category,
      status
    ) values (
      p_letter_id,
      p_actor_id,
      p_category,
      'open'
    )
    on conflict (letter_id, reporter_id) do update
    set category = excluded.category
    returning id into v_report_id;

    update public.letters
    set state = 'reported',
        updated_at = now()
    where id = p_letter_id;

    update public.correspondences
    set status = 'reported',
        closed_at = coalesce(closed_at, now()),
        updated_at = now()
    where id = v_letter.correspondence_id;
  else
    update public.letters
    set state = case when state = 'reported' then 'reported' else 'stopped' end,
        updated_at = now()
    where id = p_letter_id;

    update public.correspondences
    set status = case when status = 'reported' then 'reported' else 'stopped' end,
        closed_at = coalesce(closed_at, now()),
        updated_at = now()
    where id = v_letter.correspondence_id;
  end if;

  result := case when p_action = 'report' then 'reported' else 'stopped' end;
  select status into correspondence_status
  from public.correspondences
  where id = v_letter.correspondence_id;
  report_id := v_report_id;
  return next;
end;
$$;

revoke all on function public.apply_letter_action(uuid, uuid, text, text)
from public, anon, authenticated;

grant execute on function public.apply_letter_action(uuid, uuid, text, text)
to service_role;
