create or replace function private.record_opening_started()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'opening' and new.state <> 'failed' then
    insert into public.member_stats (
      user_id,
      correspondences_started_count,
      updated_at
    ) values (
      new.sender_id,
      1,
      now()
    )
    on conflict (user_id) do update
    set correspondences_started_count = public.member_stats.correspondences_started_count + 1,
        updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.record_opening_started() from public, anon, authenticated;

drop trigger if exists letters_record_opening_started on public.letters;
create trigger letters_record_opening_started
after insert on public.letters
for each row execute function private.record_opening_started();

insert into public.member_stats (user_id, correspondences_started_count, updated_at)
select sender_id, count(*)::integer, now()
from public.letters
where kind = 'opening' and state <> 'failed'
group by sender_id
on conflict (user_id) do update
set correspondences_started_count = greatest(
      public.member_stats.correspondences_started_count,
      excluded.correspondences_started_count
    ),
    updated_at = now();

create or replace function public.record_provider_delivery(
  p_provider_outbound_id text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  delivered_letter public.letters%rowtype;
begin
  select * into delivered_letter
  from public.letters
  where provider_outbound_id = p_provider_outbound_id
  for update;

  if not found then return; end if;
  if delivered_letter.state = 'delivered' then return; end if;

  update public.letters
  set state = 'delivered',
      delivered_at = coalesce(delivered_at, now()),
      failure_reason = null,
      updated_at = now()
  where id = delivered_letter.id;

  update public.correspondences
  set status = case when status = 'assigned' then 'delivered' else status end,
      last_exchange_at = now(),
      updated_at = now()
  where id = delivered_letter.correspondence_id;

  insert into public.member_stats (user_id, last_letter_sent_at, updated_at)
  values (delivered_letter.sender_id, now(), now())
  on conflict (user_id) do update
  set last_letter_sent_at = now(), updated_at = now();

  insert into public.member_stats (user_id, last_letter_received_at, updated_at)
  values (delivered_letter.recipient_id, now(), now())
  on conflict (user_id) do update
  set last_letter_received_at = now(), updated_at = now();
end;
$$;
