-- Permission-checked operations. Every function:
--   * identifies the caller with auth.uid() and checks their role/team in the database,
--   * uses the database clock (now()) for deadlines, never a client timestamp,
--   * writes its audit record in the same transaction for organiser actions.
-- Error messages are participant-safe and shown in the UI as they are.

-- ───────────────────────────── column privacy ─────────────────────────────

alter table public.verification_attempts add column request_id text;
create unique index attempts_request_once on public.verification_attempts (participant_id, request_id) where request_id is not null;

-- RLS selects rows; these grants select columns. Evidence (hidden inputs, raw responses) and
-- project verifier tokens are only reachable through the organiser/team functions below.
revoke select on public.verification_attempts from anon, authenticated;
grant select (id, tournament_id, layer_run_id, participant_id, attempt_no, version, submitted_at, status, score, feedback, started_at, finished_at, reviewed_at, review_note)
  on public.verification_attempts to authenticated;
revoke select on public.projects from anon, authenticated;
grant select (id, event_id, team_id, name, repo_url, demo_url, endpoint_url, endpoint_checked_at, endpoint_check, created_at, updated_at)
  on public.projects to authenticated;
revoke select on public.challenge_sessions, public.tool_invocations, public.verification_jobs from anon;

-- Browsers never write these directly; only functions (definer) and the worker (service role).
revoke insert, update, delete on
  public.tournaments, public.tournament_versions, public.layer_runs, public.tournament_participants,
  public.verification_attempts, public.verification_jobs, public.verification_receipts, public.challenge_sessions,
  public.tool_invocations, public.advancement_decisions, public.achievements, public.activity_events,
  public.teams, public.team_members, public.team_invites, public.projects, public.mentor_requests,
  public.submissions, public.submission_artifacts, public.judge_assignments, public.judging_scores, public.winners,
  public.audit_logs, public.worker_heartbeats, public.platform_admins
  from anon, authenticated;

-- ───────────────────────────── audit trigger for direct organiser edits ─────────────────────────────

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs (event_id, actor_id, action, target_type, target_id, details)
  values (
    nullif(v_row ->> 'event_id', '')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    jsonb_build_object('old', case when tg_op <> 'INSERT' then to_jsonb(old) end, 'new', case when tg_op <> 'DELETE' then to_jsonb(new) end)
  );
  return coalesce(new, old);
end $$;

create trigger audit_event_roles after insert or update or delete on public.event_roles for each row execute function public.audit_row_change();
create trigger audit_registrations after update or delete on public.registrations for each row execute function public.audit_row_change();
create trigger audit_announcements after insert or update or delete on public.announcements for each row execute function public.audit_row_change();
create trigger audit_rubrics after insert or update or delete on public.judging_rubrics for each row execute function public.audit_row_change();
create trigger audit_tracks after insert or update or delete on public.event_tracks for each row execute function public.audit_row_change();

-- ───────────────────────────── small helpers ─────────────────────────────

create or replace function public.require_user() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '28000'; end if;
  return auth.uid();
end $$;

create or replace function public.require_organiser(p_event uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.require_user();
begin
  if not public.is_organiser(p_event) then raise exception 'Only organisers of this event can do that.' using errcode = '42501'; end if;
  return v_uid;
end $$;

create or replace function public.emit(p_event uuid, p_tournament uuid, p_kind text, p_public boolean, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.activity_events (event_id, tournament_id, kind, is_public, payload) values (p_event, p_tournament, p_kind, p_public, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function public.tournament_event(p_tournament uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from public.tournaments where id = p_tournament;
$$;

-- The caller's participant row in a tournament (their team's, or their own for individual events).
create or replace function public.my_participant(p_tournament uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select tp.id from public.tournament_participants tp
  where tp.tournament_id = p_tournament
    and (tp.user_id = auth.uid() or (tp.team_id is not null and public.is_team_member(tp.team_id)))
  limit 1;
$$;

-- ───────────────────────────── teams & projects ─────────────────────────────

create or replace function public.create_team(p_event uuid, p_name text, p_track public.official_track) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_team uuid;
begin
  if not public.has_event_role(p_event, array['participant', 'organiser']::public.event_role[]) then
    raise exception 'Your account is not on the approved participant list for this event. Ask an organiser to check your registration.' using errcode = '42501';
  end if;
  if exists (select 1 from public.team_members where event_id = p_event and user_id = v_uid) then
    raise exception 'You are already in a team for this event.' using errcode = '23505';
  end if;
  insert into public.teams (event_id, name, track, captain_id) values (p_event, trim(p_name), p_track, v_uid) returning id into v_team;
  insert into public.team_members (team_id, event_id, user_id, role) values (v_team, p_event, v_uid, 'captain');
  insert into public.projects (event_id, team_id, name) values (p_event, v_team, trim(p_name));
  perform public.emit(p_event, null, 'team.created', true, jsonb_build_object('team', trim(p_name)));
  return v_team;
end $$;

create or replace function public.create_team_invite(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_code text; v_event uuid;
begin
  select event_id into v_event from public.teams where id = p_team and captain_id = v_uid;
  if v_event is null then raise exception 'Only the team captain can invite people.' using errcode = '42501'; end if;
  insert into public.team_invites (team_id, event_id, created_by) values (p_team, v_event, v_uid) returning code into v_code;
  return v_code;
end $$;

create or replace function public.join_team(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_inv public.team_invites;
begin
  select * into v_inv from public.team_invites where code = p_code for update;
  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.expires_at < now() or v_inv.uses >= v_inv.max_uses then
    raise exception 'That invite code is not valid any more. Ask your captain for a new one.' using errcode = '22023';
  end if;
  if not public.has_event_role(v_inv.event_id, array['participant', 'organiser']::public.event_role[]) then
    raise exception 'Your account is not on the approved participant list for this event.' using errcode = '42501';
  end if;
  if exists (select 1 from public.team_members where event_id = v_inv.event_id and user_id = v_uid) then
    raise exception 'You are already in a team for this event.' using errcode = '23505';
  end if;
  insert into public.team_members (team_id, event_id, user_id) values (v_inv.team_id, v_inv.event_id, v_uid);
  update public.team_invites set uses = uses + 1 where id = v_inv.id;
  return v_inv.team_id;
end $$;

create or replace function public.leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_team public.teams; v_next uuid;
begin
  select * into v_team from public.teams where id = p_team;
  delete from public.team_members where team_id = p_team and user_id = v_uid;
  if v_team.captain_id = v_uid then
    select user_id into v_next from public.team_members where team_id = p_team order by joined_at limit 1;
    if v_next is null then
      -- Last member: keep the team row (it may hold submissions) but nobody owns it.
      return;
    end if;
    update public.teams set captain_id = v_next where id = p_team;
    update public.team_members set role = 'captain' where team_id = p_team and user_id = v_next;
  end if;
end $$;

create or replace function public.update_project(p_team uuid, p_name text, p_repo text, p_demo text, p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_user();
  if not public.is_team_member(p_team) then raise exception 'Only team members can edit the project.' using errcode = '42501'; end if;
  if p_endpoint is not null and p_endpoint <> '' and p_endpoint !~ '^https?://[^\s/$.?#].[^\s]*$' then
    raise exception 'The app URL must start with https://' using errcode = '22023';
  end if;
  update public.projects set
    name = coalesce(nullif(trim(p_name), ''), name),
    repo_url = nullif(trim(p_repo), ''),
    demo_url = nullif(trim(p_demo), ''),
    endpoint_url = nullif(rtrim(trim(p_endpoint), '/'), ''),
    endpoint_checked_at = case when endpoint_url is distinct from nullif(rtrim(trim(p_endpoint), '/'), '') then null else endpoint_checked_at end,
    updated_at = now()
  where team_id = p_team;
end $$;

-- The token a team's app uses to recognise verifier calls. Team members only.
create or replace function public.project_verifier_token(p_team uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_team_member(p_team) or public.is_organiser((select event_id from public.teams where id = p_team))) then
    raise exception 'Only team members can see this token.' using errcode = '42501';
  end if;
  return (select verifier_token from public.projects where team_id = p_team);
end $$;

create or replace function public.rotate_verifier_token(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_team_member(p_team) then raise exception 'Only team members can rotate this token.' using errcode = '42501'; end if;
  update public.projects set verifier_token = v_token, updated_at = now() where team_id = p_team;
  return v_token;
end $$;

-- ───────────────────────────── tournaments: organiser lifecycle ─────────────────────────────

create or replace function public.create_tournament(p_event uuid, p_name text, p_config jsonb, p_simulation boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_organiser(p_event); v_id uuid;
begin
  insert into public.tournaments (event_id, name, description, draft_config, simulation, created_by)
  values (p_event, p_name, coalesce(p_config ->> 'description', ''), p_config, p_simulation, v_uid) returning id into v_id;
  perform public.write_audit(p_event, 'tournament.create', 'tournament', v_id::text, jsonb_build_object('name', p_name, 'simulation', p_simulation));
  return v_id;
end $$;

create or replace function public.save_tournament_draft(p_id uuid, p_config jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  if v_t.status not in ('draft', 'published') then
    raise exception 'Rules are locked once a tournament is scheduled. Use the emergency controls instead.' using errcode = '55000';
  end if;
  update public.tournaments set draft_config = p_config, name = coalesce(p_config ->> 'name', name), description = coalesce(p_config ->> 'description', description), updated_at = now() where id = p_id;
end $$;

-- The app validates p_config with parseTournamentConfig before calling this; it is stored as the new version.
create or replace function public.publish_tournament(p_id uuid, p_config jsonb, p_hash text, p_note text default '') returns int
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments; v_uid uuid; v_version int;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  v_uid := public.require_organiser(v_t.event_id);
  if v_t.status not in ('draft', 'published') then
    raise exception 'This tournament is already scheduled or running; its rules are locked.' using errcode = '55000';
  end if;
  if jsonb_typeof(p_config -> 'layers') <> 'array' or jsonb_array_length(p_config -> 'layers') = 0 then
    raise exception 'A tournament needs at least one layer.' using errcode = '22023';
  end if;
  v_version := coalesce(v_t.current_version, 0) + 1;
  insert into public.tournament_versions (tournament_id, version, config, config_hash, published_by, note) values (p_id, v_version, p_config, p_hash, v_uid, coalesce(p_note, ''));
  update public.tournaments set status = 'published', current_version = v_version, draft_config = p_config, updated_at = now() where id = p_id;
  perform public.write_audit(v_t.event_id, 'tournament.publish', 'tournament', p_id::text, jsonb_build_object('version', v_version, 'hash', p_hash));
  return v_version;
end $$;

create or replace function public.unpublish_tournament(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  if v_t.status <> 'published' then raise exception 'Only a published tournament that has not been scheduled can be unpublished.' using errcode = '55000'; end if;
  update public.tournaments set status = 'draft', updated_at = now() where id = p_id;
  perform public.write_audit(v_t.event_id, 'tournament.unpublish', 'tournament', p_id::text, '{}');
end $$;

-- Freezes the schedule: one layer_run per layer with absolute times from the published version.
create or replace function public.schedule_tournament(p_id uuid, p_starts_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments; v_cfg jsonb; v_layer jsonb; v_pos int := 0; v_start timestamptz;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  if v_t.status <> 'published' then raise exception 'Publish the tournament before scheduling it.' using errcode = '55000'; end if;
  v_start := greatest(coalesce(p_starts_at, now()), now());
  select config into v_cfg from public.tournament_versions where tournament_id = p_id and version = v_t.current_version;
  delete from public.layer_runs where tournament_id = p_id;
  for v_layer in select * from jsonb_array_elements(v_cfg -> 'layers') loop
    insert into public.layer_runs (tournament_id, version, layer_key, position, state, opens_at, deadline_at)
    values (
      p_id, v_t.current_version, v_layer ->> 'key', v_pos, 'scheduled',
      v_start + make_interval(secs => (v_layer #>> '{timing,offsetSeconds}')::int),
      v_start + make_interval(secs => (v_layer #>> '{timing,offsetSeconds}')::int + (v_layer #>> '{timing,durationSeconds}')::int)
    );
    v_pos := v_pos + 1;
  end loop;
  update public.tournaments set status = 'scheduled', starts_at = v_start, updated_at = now() where id = p_id;
  perform public.write_audit(v_t.event_id, 'tournament.schedule', 'tournament', p_id::text, jsonb_build_object('starts_at', v_start, 'version', v_t.current_version));
  perform public.emit(v_t.event_id, p_id, 'tournament.scheduled', not v_t.simulation, jsonb_build_object('starts_at', v_start));
end $$;

create or replace function public.pause_tournament(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  if v_t.status not in ('running', 'scheduled') then raise exception 'Only a scheduled or running tournament can be paused.' using errcode = '55000'; end if;
  update public.tournaments set status = 'paused', paused_at = now(), updated_at = now(),
    -- Remember where to resume to.
    draft_config = draft_config || jsonb_build_object('_resume_status', v_t.status)
  where id = p_id;
  perform public.write_audit(v_t.event_id, 'tournament.pause', 'tournament', p_id::text, jsonb_build_object('reason', p_reason));
  perform public.emit(v_t.event_id, p_id, 'tournament.paused', not v_t.simulation, jsonb_build_object('reason', p_reason));
end $$;

-- Resuming shifts every not-yet-finished window by the paused time, so nobody loses build time.
create or replace function public.resume_tournament(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments; v_shift interval;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  if v_t.status <> 'paused' then raise exception 'This tournament is not paused.' using errcode = '55000'; end if;
  v_shift := now() - v_t.paused_at;
  update public.layer_runs set opens_at = opens_at + v_shift where tournament_id = p_id and state in ('locked', 'scheduled');
  update public.layer_runs set deadline_at = deadline_at + v_shift where tournament_id = p_id and state in ('locked', 'scheduled', 'open');
  update public.tournaments set status = coalesce((draft_config ->> '_resume_status')::public.tournament_status, 'running'),
    draft_config = draft_config - '_resume_status', paused_at = null, updated_at = now() where id = p_id;
  perform public.write_audit(v_t.event_id, 'tournament.resume', 'tournament', p_id::text, jsonb_build_object('shift_seconds', extract(epoch from v_shift)));
  perform public.emit(v_t.event_id, p_id, 'tournament.resumed', not v_t.simulation, jsonb_build_object('shift_seconds', round(extract(epoch from v_shift))));
end $$;

create or replace function public.extend_layer(p_layer_run uuid, p_seconds int, p_shift_following boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_lr public.layer_runs; v_t public.tournaments;
begin
  select * into v_lr from public.layer_runs where id = p_layer_run for update;
  select * into v_t from public.tournaments where id = v_lr.tournament_id for update;
  perform public.require_organiser(v_t.event_id);
  if p_seconds < 1 or p_seconds > 24 * 3600 then raise exception 'Extend by between 1 second and 24 hours.' using errcode = '22023'; end if;
  if v_lr.state not in ('scheduled', 'open', 'closing') then raise exception 'This layer has already been finalised; reinstate or override decisions instead.' using errcode = '55000'; end if;
  update public.layer_runs set deadline_at = deadline_at + make_interval(secs => p_seconds), extended_seconds = extended_seconds + p_seconds,
    state = case when state = 'closing' and deadline_at + make_interval(secs => p_seconds) > now() then 'open' else state end
  where id = p_layer_run;
  if p_shift_following then
    update public.layer_runs set opens_at = opens_at + make_interval(secs => p_seconds), deadline_at = deadline_at + make_interval(secs => p_seconds)
    where tournament_id = v_lr.tournament_id and position > v_lr.position and state in ('locked', 'scheduled');
  end if;
  perform public.write_audit(v_t.event_id, 'layer.extend', 'layer_run', p_layer_run::text, jsonb_build_object('seconds', p_seconds, 'shift_following', p_shift_following, 'reason', p_reason));
  perform public.emit(v_t.event_id, v_t.id, 'layer.extended', not v_t.simulation, jsonb_build_object('layer', v_lr.layer_key, 'seconds', p_seconds));
end $$;

create or replace function public.set_eliminations_suspended(p_id uuid, p_suspended boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  update public.tournaments set eliminations_suspended = p_suspended, updated_at = now() where id = p_id;
  perform public.write_audit(v_t.event_id, case when p_suspended then 'tournament.suspend_eliminations' else 'tournament.resume_eliminations' end, 'tournament', p_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.cancel_tournament(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  if v_t.status in ('completed', 'cancelled') then raise exception 'This tournament has already ended.' using errcode = '55000'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for cancelling.' using errcode = '22023'; end if;
  update public.tournaments set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = p_id;
  update public.layer_runs set state = 'closed', closed_at = now() where tournament_id = p_id and state <> 'closed';
  update public.verification_jobs j set status = 'dead', last_error = 'tournament cancelled', updated_at = now()
    from public.verification_attempts a where a.id = j.attempt_id and a.tournament_id = p_id and j.status in ('queued', 'leased');
  perform public.write_audit(v_t.event_id, 'tournament.cancel', 'tournament', p_id::text, jsonb_build_object('reason', p_reason));
  perform public.emit(v_t.event_id, p_id, 'tournament.cancelled', not v_t.simulation, '{}');
end $$;

create or replace function public.archive_tournament(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_id for update;
  perform public.require_organiser(v_t.event_id);
  if v_t.status in ('scheduled', 'running', 'paused', 'finalising') then raise exception 'Cancel or finish the tournament before archiving it.' using errcode = '55000'; end if;
  update public.tournaments set archived_at = now(), updated_at = now() where id = p_id;
  perform public.write_audit(v_t.event_id, 'tournament.archive', 'tournament', p_id::text, '{}');
end $$;

create or replace function public.duplicate_tournament(p_id uuid, p_name text, p_simulation boolean default false, p_config jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments; v_new uuid; v_cfg jsonb;
begin
  select * into v_t from public.tournaments where id = p_id;
  perform public.require_organiser(v_t.event_id);
  v_cfg := coalesce(p_config, v_t.draft_config - '_resume_status') || jsonb_build_object('name', p_name);
  insert into public.tournaments (event_id, name, description, draft_config, simulation, created_by)
  values (v_t.event_id, p_name, v_t.description, v_cfg, p_simulation, auth.uid()) returning id into v_new;
  perform public.write_audit(v_t.event_id, 'tournament.duplicate', 'tournament', v_new::text, jsonb_build_object('from', p_id, 'simulation', p_simulation));
  return v_new;
end $$;

-- ───────────────────────────── participation ─────────────────────────────

create or replace function public.join_tournament(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_t public.tournaments; v_cfg jsonb; v_team public.teams; v_pid uuid;
begin
  select * into v_t from public.tournaments where id = p_id;
  if v_t.id is null or v_t.simulation or v_t.status not in ('published', 'scheduled') then
    raise exception 'Registration for this tournament is not open.' using errcode = '55000';
  end if;
  if not public.has_event_role(v_t.event_id, array['participant', 'organiser']::public.event_role[]) then
    raise exception 'Your account is not on the approved participant list for this event.' using errcode = '42501';
  end if;
  select config into v_cfg from public.tournament_versions where tournament_id = p_id and version = v_t.current_version;
  if coalesce(v_cfg ->> 'participation', 'team') = 'team' then
    select t.* into v_team from public.teams t join public.team_members m on m.team_id = t.id where t.event_id = v_t.event_id and m.user_id = v_uid;
    if v_team.id is null then raise exception 'Create or join a team first.' using errcode = '22023'; end if;
    insert into public.tournament_participants (tournament_id, event_id, team_id, display_name) values (p_id, v_t.event_id, v_team.id, v_team.name)
      on conflict (tournament_id, team_id) do update set display_name = excluded.display_name returning id into v_pid;
  else
    insert into public.tournament_participants (tournament_id, event_id, user_id, display_name)
    values (p_id, v_t.event_id, v_uid, coalesce((select nullif(display_name, '') from public.profiles where id = v_uid), 'Participant'))
      on conflict (tournament_id, user_id) do update set display_name = excluded.display_name returning id into v_pid;
  end if;
  perform public.emit(v_t.event_id, p_id, 'participant.joined', true, jsonb_build_object('name', (select display_name from public.tournament_participants where id = v_pid)));
  return v_pid;
end $$;

-- Rehearsals only: a fixture "team" that points at a reference app.
create or replace function public.add_fixture_participant(p_id uuid, p_name text, p_endpoint text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments; v_pid uuid;
begin
  select * into v_t from public.tournaments where id = p_id;
  perform public.require_organiser(v_t.event_id);
  if not v_t.simulation then raise exception 'Fixture teams can only join rehearsal tournaments.' using errcode = '42501'; end if;
  insert into public.tournament_participants (tournament_id, event_id, display_name, fixture_endpoint)
  values (p_id, v_t.event_id, p_name, p_endpoint) returning id into v_pid;
  perform public.write_audit(v_t.event_id, 'tournament.add_fixture', 'tournament_participant', v_pid::text, jsonb_build_object('name', p_name));
  return v_pid;
end $$;

-- Participants submit an attempt; the worker verifies it. The server timestamp decides timeliness.
create or replace function public.submit_attempt(p_id uuid, p_layer_key text, p_request_id text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_t public.tournaments; v_cfg jsonb; v_layer jsonb; v_lr public.layer_runs; v_p public.tournament_participants;
  v_count int; v_last timestamptz; v_max int; v_cooldown int; v_endpoint text; v_attempt uuid; v_prereq text;
begin
  select * into v_t from public.tournaments where id = p_id;
  if v_t.id is null or v_t.status <> 'running' then
    raise exception 'The tournament is not running right now%.', case when v_t.status = 'paused' then ' (paused by the organisers)' else '' end using errcode = '55000';
  end if;
  select * into v_p from public.tournament_participants where id = public.my_participant(p_id);
  if v_p.id is null then raise exception 'Your team has not joined this tournament.' using errcode = '42501'; end if;
  if v_p.state not in ('active', 'qualified') then
    raise exception 'Your team is no longer competing in this tournament. You can keep building and still submit to the event tracks.' using errcode = '55000';
  end if;
  if p_request_id is not null then
    select id into v_attempt from public.verification_attempts where participant_id = v_p.id and request_id = p_request_id;
    if v_attempt is not null then return v_attempt; end if;
  end if;
  select * into v_lr from public.layer_runs where tournament_id = p_id and layer_key = p_layer_key for update;
  if v_lr.id is null then raise exception 'Unknown layer.' using errcode = '22023'; end if;
  if v_lr.state <> 'open' or now() < v_lr.opens_at or now() >= v_lr.deadline_at then
    raise exception 'This layer is not open for attempts.' using errcode = '55000';
  end if;
  select config into v_cfg from public.tournament_versions where tournament_id = p_id and version = v_lr.version;
  select l into v_layer from jsonb_array_elements(v_cfg -> 'layers') l where l ->> 'key' = p_layer_key;
  for v_prereq in select jsonb_array_elements_text(coalesce(v_layer -> 'prerequisites', '[]'::jsonb)) loop
    if not exists (
      select 1 from public.verification_attempts a join public.layer_runs r on r.id = a.layer_run_id
      where a.participant_id = v_p.id and r.layer_key = v_prereq and a.status = 'passed'
    ) then
      raise exception 'Pass "%" first.', v_prereq using errcode = '55000';
    end if;
  end loop;
  select count(*), max(submitted_at) into v_count, v_last from public.verification_attempts where layer_run_id = v_lr.id and participant_id = v_p.id;
  v_max := nullif(v_layer #>> '{retries,maxAttempts}', '')::int;
  v_cooldown := coalesce((v_layer #>> '{retries,cooldownSeconds}')::int, 30);
  if v_max is not null and v_count >= v_max then raise exception 'No attempts left for this layer (% allowed).', v_max using errcode = '55000'; end if;
  if v_last is not null and v_last + make_interval(secs => v_cooldown) > now() then
    raise exception 'Wait % more seconds before the next attempt.', ceil(extract(epoch from (v_last + make_interval(secs => v_cooldown) - now()))) using errcode = '55000';
  end if;
  if exists (select 1 from public.verification_attempts where layer_run_id = v_lr.id and participant_id = v_p.id and status in ('queued', 'running')) then
    raise exception 'Your previous attempt is still being verified.' using errcode = '55000';
  end if;
  v_endpoint := coalesce(v_p.fixture_endpoint, (select endpoint_url from public.projects where team_id = v_p.team_id));
  if v_endpoint is null then raise exception 'Add your app''s URL on the team page first.' using errcode = '22023'; end if;
  insert into public.verification_attempts (tournament_id, layer_run_id, participant_id, attempt_no, version, submitted_by, endpoint_url, request_id)
  values (p_id, v_lr.id, v_p.id, v_count + 1, v_lr.version, v_uid, v_endpoint, p_request_id) returning id into v_attempt;
  insert into public.verification_jobs (attempt_id) values (v_attempt);
  perform public.emit(v_t.event_id, p_id, 'attempt.submitted', true, jsonb_build_object('layer', p_layer_key));
  return v_attempt;
end $$;

-- ───────────────────────────── organiser interventions ─────────────────────────────

create or replace function public.reprocess_attempt(p_attempt uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.verification_attempts; v_event uuid;
begin
  select * into v_a from public.verification_attempts where id = p_attempt for update;
  v_event := public.tournament_event(v_a.tournament_id);
  perform public.require_organiser(v_event);
  update public.verification_attempts set status = 'queued', score = null, feedback = '[]', evidence = '{}', started_at = null, finished_at = null where id = p_attempt;
  delete from public.verification_receipts where attempt_id = p_attempt;
  update public.verification_jobs set status = 'queued', tries = 0, run_after = now(), lease_owner = null, lease_expires_at = null, last_error = null, updated_at = now() where attempt_id = p_attempt;
  -- A reprocessed attempt can change a finalised layer; the layer re-enters finalisation.
  update public.layer_runs set state = 'finalising', closed_at = null where id = v_a.layer_run_id and state = 'closed'
    and not exists (select 1 from public.advancement_decisions d where d.layer_run_id = v_a.layer_run_id and d.participant_id = v_a.participant_id);
  perform public.write_audit(v_event, 'attempt.reprocess', 'verification_attempt', p_attempt::text, jsonb_build_object('reason', p_reason));
end $$;

-- Manual result for attempts that need a human (review_required) or hit an infrastructure error.
create or replace function public.review_attempt(p_attempt uuid, p_passed boolean, p_score numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.verification_attempts; v_event uuid;
begin
  select * into v_a from public.verification_attempts where id = p_attempt for update;
  v_event := public.tournament_event(v_a.tournament_id);
  perform public.require_organiser(v_event);
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note explaining the decision.' using errcode = '22023'; end if;
  update public.verification_attempts set status = case when p_passed then 'passed' else 'failed' end, score = p_score,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note, finished_at = coalesce(finished_at, now())
  where id = p_attempt;
  update public.verification_jobs set status = 'done', updated_at = now() where attempt_id = p_attempt and status <> 'done';
  perform public.write_audit(v_event, 'attempt.review', 'verification_attempt', p_attempt::text, jsonb_build_object('passed', p_passed, 'score', p_score, 'note', p_note));
end $$;

create or replace function public.reinstate_participant(p_participant uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.tournament_participants; v_t public.tournaments;
begin
  select * into v_p from public.tournament_participants where id = p_participant for update;
  select * into v_t from public.tournaments where id = v_p.tournament_id;
  perform public.require_organiser(v_t.event_id);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for reinstating.' using errcode = '22023'; end if;
  if v_p.state <> 'eliminated' then raise exception 'Only eliminated participants can be reinstated.' using errcode = '55000'; end if;
  update public.tournament_participants set state = 'active', eliminated_layer_key = null, eliminated_at = null where id = p_participant;
  update public.advancement_decisions set decision = 'qualified', overridden_by = auth.uid(), overridden_at = now(), override_reason = p_reason
    where participant_id = p_participant and decision = 'eliminated';
  perform public.write_audit(v_t.event_id, 'participant.reinstate', 'tournament_participant', p_participant::text, jsonb_build_object('reason', p_reason));
  perform public.emit(v_t.event_id, v_t.id, 'participant.reinstated', not v_t.simulation, jsonb_build_object('name', v_p.display_name));
end $$;

create or replace function public.override_decision(p_decision uuid, p_new public.decision_kind, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_d public.advancement_decisions; v_t public.tournaments; v_key text;
begin
  select * into v_d from public.advancement_decisions where id = p_decision for update;
  select * into v_t from public.tournaments where id = v_d.tournament_id;
  perform public.require_organiser(v_t.event_id);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the override.' using errcode = '22023'; end if;
  select layer_key into v_key from public.layer_runs where id = v_d.layer_run_id;
  update public.advancement_decisions set decision = p_new, overridden_by = auth.uid(), overridden_at = now(), override_reason = p_reason where id = p_decision;
  if p_new = 'eliminated' then
    update public.tournament_participants set state = 'eliminated', eliminated_layer_key = v_key, eliminated_at = now() where id = v_d.participant_id;
  elsif v_d.decision = 'eliminated' then
    update public.tournament_participants set state = 'active', eliminated_layer_key = null, eliminated_at = null where id = v_d.participant_id and state = 'eliminated';
  end if;
  perform public.write_audit(v_t.event_id, 'decision.override', 'advancement_decision', p_decision::text, jsonb_build_object('from', v_d.decision, 'to', p_new, 'reason', p_reason));
end $$;

-- Organisers read full evidence through this; participants never can.
create or replace function public.attempt_evidence(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_a public.verification_attempts;
begin
  select * into v_a from public.verification_attempts where id = p_attempt;
  perform public.require_organiser(public.tournament_event(v_a.tournament_id));
  return v_a.evidence;
end $$;

-- ───────────────────────────── mentors ─────────────────────────────

create or replace function public.request_mentor(p_event uuid, p_category text, p_description text, p_location text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_id uuid; v_team uuid;
begin
  if not public.has_event_role(p_event, array['participant', 'organiser']::public.event_role[]) then
    raise exception 'Only registered participants can request a mentor.' using errcode = '42501';
  end if;
  if (select count(*) from public.mentor_requests where requester_id = v_uid and status in ('open', 'claimed')) >= 3 then
    raise exception 'You already have 3 open requests. A mentor will be with you soon.' using errcode = '55000';
  end if;
  select team_id into v_team from public.team_members where event_id = p_event and user_id = v_uid;
  insert into public.mentor_requests (event_id, team_id, requester_id, category, description, location)
  values (p_event, v_team, v_uid, p_category, trim(p_description), coalesce(trim(p_location), '')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_mentor_request(p_id uuid, p_action text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_r public.mentor_requests;
begin
  select * into v_r from public.mentor_requests where id = p_id for update;
  if p_action = 'cancel' then
    if v_r.requester_id <> v_uid then raise exception 'Only the person who asked can cancel.' using errcode = '42501'; end if;
    update public.mentor_requests set status = 'resolved', resolved_at = now(), notes = notes || jsonb_build_array(jsonb_build_object('by', v_uid, 'at', now(), 'text', 'Cancelled by requester')) where id = p_id;
    return;
  end if;
  if not public.has_event_role(v_r.event_id, array['mentor', 'organiser']::public.event_role[]) then
    raise exception 'Only mentors can do that.' using errcode = '42501';
  end if;
  update public.mentor_requests set
    status = case p_action when 'claim' then 'claimed' when 'resolve' then 'resolved' when 'escalate' then 'escalated' when 'release' then 'open' else status end,
    claimed_by = case p_action when 'claim' then v_uid when 'release' then null else claimed_by end,
    claimed_at = case p_action when 'claim' then now() else claimed_at end,
    resolved_at = case p_action when 'resolve' then now() else resolved_at end,
    notes = case when coalesce(trim(p_note), '') <> '' then notes || jsonb_build_array(jsonb_build_object('by', v_uid, 'at', now(), 'text', trim(p_note))) else notes end
  where id = p_id;
end $$;

-- ───────────────────────────── submissions ─────────────────────────────

create or replace function public.save_submission(p_event uuid, p_track public.official_track, p_title text, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_team uuid; v_id uuid; v_s public.submissions; v_close timestamptz;
begin
  select team_id into v_team from public.team_members where event_id = p_event and user_id = v_uid;
  if v_team is null then raise exception 'Create or join a team before submitting.' using errcode = '22023'; end if;
  select submissions_close_at into v_close from public.event_tracks where event_id = p_event and track = p_track;
  if not found then raise exception 'This event has no % track.', p_track using errcode = '22023'; end if;
  select * into v_s from public.submissions where event_id = p_event and team_id = v_team and track = p_track for update;
  if v_s.status = 'submitted' then raise exception 'This submission is final. Ask an organiser to reopen it.' using errcode = '55000'; end if;
  if v_close is not null and now() > v_close and v_s.status is distinct from 'reopened' then
    raise exception 'Submissions for this track have closed.' using errcode = '55000';
  end if;
  insert into public.submissions (event_id, team_id, track, title, fields, updated_at) values (p_event, v_team, p_track, coalesce(p_title, ''), coalesce(p_fields, '{}'), now())
  on conflict (event_id, team_id, track) do update set title = excluded.title, fields = excluded.fields, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.finalise_submission(p_submission uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_s public.submissions; v_close timestamptz; v_code text;
begin
  select * into v_s from public.submissions where id = p_submission for update;
  if v_s.id is null or not public.is_team_member(v_s.team_id) then raise exception 'Only team members can submit.' using errcode = '42501'; end if;
  if v_s.status = 'submitted' then return v_s.receipt_code; end if;
  select submissions_close_at into v_close from public.event_tracks where event_id = v_s.event_id and track = v_s.track;
  if v_close is not null and now() > v_close and v_s.status <> 'reopened' then raise exception 'Submissions for this track have closed.' using errcode = '55000'; end if;
  if coalesce(trim(v_s.title), '') = '' then raise exception 'Add a title before submitting.' using errcode = '22023'; end if;
  v_code := upper(substr(encode(extensions.digest(v_s.id::text || now()::text, 'sha256'), 'hex'), 1, 10));
  update public.submissions set status = 'submitted', submitted_at = now(), submitted_by = v_uid, receipt_code = v_code, updated_at = now() where id = p_submission;
  perform public.emit(v_s.event_id, null, 'submission.final', true, jsonb_build_object('track', v_s.track, 'team', (select name from public.teams where id = v_s.team_id)));
  return v_code;
end $$;

create or replace function public.reopen_submission(p_submission uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_s public.submissions;
begin
  select * into v_s from public.submissions where id = p_submission for update;
  perform public.require_organiser(v_s.event_id);
  update public.submissions set status = 'reopened', reopened_by = auth.uid(), updated_at = now() where id = p_submission;
  perform public.write_audit(v_s.event_id, 'submission.reopen', 'submission', p_submission::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.add_submission_link(p_submission uuid, p_kind text, p_label text, p_url text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_s public.submissions; v_id uuid;
begin
  select * into v_s from public.submissions where id = p_submission;
  if v_s.id is null or not public.is_team_member(v_s.team_id) then raise exception 'Only team members can add material.' using errcode = '42501'; end if;
  if v_s.status = 'submitted' then raise exception 'This submission is final.' using errcode = '55000'; end if;
  if p_url !~ '^https://' then raise exception 'Links must start with https://' using errcode = '22023'; end if;
  insert into public.submission_artifacts (submission_id, event_id, kind, label, url) values (p_submission, v_s.event_id, p_kind, coalesce(p_label, ''), p_url) returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── judging ─────────────────────────────

create or replace function public.assign_judge(p_event uuid, p_judge uuid, p_submission uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.require_organiser(p_event);
  if not exists (select 1 from public.event_roles where event_id = p_event and user_id = p_judge and role = 'judge') then
    raise exception 'That person is not a judge for this event.' using errcode = '22023';
  end if;
  insert into public.judge_assignments (event_id, judge_id, submission_id) values (p_event, p_judge, p_submission)
    on conflict (judge_id, submission_id) do update set status = public.judge_assignments.status returning id into v_id;
  insert into public.judging_scores (assignment_id, event_id) values (v_id, p_event) on conflict do nothing;
  perform public.write_audit(p_event, 'judging.assign', 'judge_assignment', v_id::text, jsonb_build_object('judge', p_judge, 'submission', p_submission));
  return v_id;
end $$;

create or replace function public.save_judging_score(p_assignment uuid, p_scores jsonb, p_comments text, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.judge_assignments; v_s public.judging_scores;
begin
  select * into v_a from public.judge_assignments where id = p_assignment for update;
  if v_a.judge_id is distinct from auth.uid() then raise exception 'This is not your assignment.' using errcode = '42501'; end if;
  if v_a.status = 'conflict' then raise exception 'You flagged a conflict of interest for this submission.' using errcode = '55000'; end if;
  select * into v_s from public.judging_scores where assignment_id = p_assignment for update;
  if v_s.final then raise exception 'You already submitted final scores for this submission.' using errcode = '55000'; end if;
  update public.judging_scores set scores = coalesce(p_scores, '{}'), comments = coalesce(p_comments, ''), final = p_final,
    submitted_at = case when p_final then now() else null end, updated_at = now() where assignment_id = p_assignment;
  update public.judge_assignments set status = case when p_final then 'submitted' else 'in_progress' end where id = p_assignment;
end $$;

create or replace function public.flag_judging(p_assignment uuid, p_kind text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.judge_assignments;
begin
  select * into v_a from public.judge_assignments where id = p_assignment for update;
  if v_a.judge_id is distinct from auth.uid() then raise exception 'This is not your assignment.' using errcode = '42501'; end if;
  if p_kind not in ('conflict', 'clarification') then raise exception 'Unknown flag.' using errcode = '22023'; end if;
  update public.judge_assignments set status = p_kind, conflict_note = p_note where id = p_assignment;
  perform public.write_audit(v_a.event_id, 'judging.flag_' || p_kind, 'judge_assignment', p_assignment::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.publish_winner(p_event uuid, p_track public.official_track, p_submission uuid, p_place int, p_title text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  insert into public.winners (event_id, track, submission_id, place, title, published_at, published_by)
  values (p_event, p_track, p_submission, p_place, coalesce(p_title, ''), now(), auth.uid())
  on conflict (event_id, track, place) do update set submission_id = excluded.submission_id, title = excluded.title, published_at = now(), published_by = auth.uid();
  perform public.write_audit(p_event, 'winner.publish', 'submission', p_submission::text, jsonb_build_object('track', p_track, 'place', p_place));
  perform public.emit(p_event, null, 'winner.published', true, jsonb_build_object('track', p_track, 'place', p_place, 'title', p_title));
end $$;

-- ───────────────────────────── grants ─────────────────────────────

revoke execute on all functions in schema public from anon;
grant execute on function public.is_platform_admin, public.has_event_role, public.is_organiser, public.is_team_member, public.owns_participant to anon, authenticated;
