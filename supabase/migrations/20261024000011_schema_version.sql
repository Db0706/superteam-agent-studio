-- Lets Admin → Readiness compare the database's latest migration with the one the deployed code
-- expects, so a merge whose migration wasn't applied shows up instead of failing quietly.
create or replace function public.schema_version(p_event uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  return (select max(version) from supabase_migrations.schema_migrations);
end $$;
revoke execute on function public.schema_version(uuid) from public, anon;
grant execute on function public.schema_version(uuid) to authenticated;
