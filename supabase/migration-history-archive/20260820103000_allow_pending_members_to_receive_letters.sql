do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.reserve_opening_letter(uuid, uuid, uuid, text, text, text, text, text, text, text, text, smallint, smallint, text)'::regprocedure
  ) into definition;

  definition := replace(
    definition,
    $$candidate.account_status in ('founding', 'free', 'annual')$$,
    $$candidate.account_status in ('founding', 'free', 'checkout_pending', 'annual')$$
  );
  execute definition;
end $migration$;
