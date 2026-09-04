create unique index if not exists analytics_events_user_event_idx
  on private.analytics_events (event_name, user_id)
  where user_id is not null;

create or replace function public.record_analytics_event(
  p_event_name text,
  p_user_id uuid default null,
  p_source text default null,
  p_campaign text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare v_id uuid;
begin
  insert into private.analytics_events (event_name, user_id, source, campaign, metadata)
  values (p_event_name, p_user_id, nullif(p_source, ''), nullif(left(p_campaign, 100), ''), coalesce(p_metadata, '{}'::jsonb))
  on conflict (event_name, user_id) where user_id is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;
