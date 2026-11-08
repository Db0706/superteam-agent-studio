-- The database clock for countdowns: clients compute "time left" from this, not their own clock.
create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;
grant execute on function public.server_now() to anon, authenticated;
