-- Functions were executable by anon through PUBLIC (Postgres grants EXECUTE to PUBLIC by default,
-- and revoking from anon alone doesn't remove that). Every function already checks its caller, so
-- this is defence in depth: signed-in users get the functions, anon only the read helpers that
-- row-level security and the public pages need, and internal helpers stay closed to everyone.

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- Internal helpers: called only from other functions and triggers, never directly.
revoke execute on function public.write_audit(uuid, text, text, text, jsonb) from authenticated;
revoke execute on function public.emit(uuid, uuid, text, boolean, jsonb) from authenticated;
revoke execute on function public.audit_row_change() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

-- Read helpers used by RLS policies and the public leaderboard, race page and venue screen.
grant execute on function
  public.is_platform_admin(), public.has_event_role(uuid, public.event_role[]), public.is_organiser(uuid),
  public.is_team_member(uuid), public.owns_participant(uuid), public.server_now(),
  public.event_leaderboard(uuid), public.team_university(uuid)
to anon;

-- New functions don't become public by default.
alter default privileges in schema public revoke execute on functions from public, anon;
