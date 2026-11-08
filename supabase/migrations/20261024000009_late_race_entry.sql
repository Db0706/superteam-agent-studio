-- Teams could only enter a race before it started. In a points race the build sprint is the race,
-- and teams form during it, so a team created after the start was locked out for the whole day.
-- Entry now stays open while the race runs, until an eliminating layer has been decided (a late
-- team must not skip a cut it never faced). Points races never eliminate, so they stay open.

create or replace function public.race_entry_open(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when t.simulation then false
    when t.status in ('published', 'scheduled') then true
    when t.status not in ('running', 'paused') then false
    else not exists (
      select 1
      from public.layer_runs r
      join public.tournament_versions v on v.tournament_id = r.tournament_id and v.version = r.version
      cross join lateral jsonb_array_elements(v.config -> 'layers') l
      where r.tournament_id = t.id and r.state in ('finalising', 'closed') and l ->> 'key' = r.layer_key
        and case v.config ->> 'mode'
              when 'checkpoint' then false
              when 'hybrid' then coalesce(l ->> 'outcome', 'eliminate') = 'eliminate'
              else true
            end
    )
  end
  from public.tournaments t where t.id = p_id
$$;
revoke execute on function public.race_entry_open(uuid) from public, anon;
grant execute on function public.race_entry_open(uuid) to authenticated;

create or replace function public.join_tournament(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_user(); v_t public.tournaments; v_cfg jsonb; v_team public.teams; v_pid uuid;
begin
  select * into v_t from public.tournaments where id = p_id;
  if v_t.id is null or not coalesce(public.race_entry_open(p_id), false) then
    raise exception 'Entries for this race are closed.' using errcode = '55000';
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
  -- The scheduler activates everyone registered at the start; a team joining mid-race starts active.
  if v_t.status in ('running', 'paused') then
    update public.tournament_participants set state = 'active' where id = v_pid and state = 'registered';
  end if;
  perform public.emit(v_t.event_id, p_id, 'participant.joined', true, jsonb_build_object('name', (select display_name from public.tournament_participants where id = v_pid)));
  return v_pid;
end $$;
