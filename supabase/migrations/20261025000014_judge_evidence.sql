-- Judges see what the platform verified for the teams they're scoring (build stages and
-- challenges passed, and when), from races whose organisers switched on "Show results to judges".
-- Only for teams in the caller's own judging assignments.
create or replace function public.judge_team_evidence(p_event uuid) returns table (team_id uuid, layer_title text, category text, passed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct s.team_id from public.judge_assignments ja
    join public.submissions s on s.id = ja.submission_id
    where ja.event_id = p_event and ja.judge_id = auth.uid()
  ),
  races as (
    select t.id, v.config from public.tournaments t
    join public.tournament_versions v on v.tournament_id = t.id and v.version = t.current_version
    where t.event_id = p_event and not t.simulation and t.archived_at is null and t.status <> 'cancelled'
      and coalesce((v.config ->> 'countsTowardsJudging')::boolean, false)
  )
  select tp.team_id, coalesce(l ->> 'title', r.layer_key), coalesce(l ->> 'category', 'challenge'), min(a.finished_at)
  from races
  join public.tournament_participants tp on tp.tournament_id = races.id and tp.team_id in (select team_id from mine)
  join public.verification_attempts a on a.participant_id = tp.id and a.status = 'passed'
  join public.layer_runs r on r.id = a.layer_run_id
  left join lateral (select x from jsonb_array_elements(races.config -> 'layers') x where x ->> 'key' = r.layer_key limit 1) cfg(l) on true
  group by tp.team_id, r.layer_key, l, r.position
  order by tp.team_id, min(a.finished_at)
$$;
revoke execute on function public.judge_team_evidence(uuid) from public, anon;
grant execute on function public.judge_team_evidence(uuid) to authenticated;
