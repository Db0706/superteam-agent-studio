-- Points races: a live leaderboard (Cambridge vs Oxford), team universities and finalists.

-- ───────────────────────────── team university ─────────────────────────────

alter table public.teams add column university_override text check (university_override in ('cambridge', 'oxford', 'mixed', 'other'));

-- 'cambridge' | 'oxford' | 'mixed' | 'other', from members' registrations unless an organiser set it.
create or replace function public.team_university(p_team uuid) returns text
language sql stable security definer set search_path = public as $$
  with t as (select id, event_id, university_override from public.teams where id = p_team),
  m as (
    select case
      when r.university ilike '%cambridge%' then 'cambridge'
      when r.university ilike '%oxford%' then 'oxford'
      else null end as uni
    from public.team_members tm
    join t on t.id = tm.team_id
    left join public.registrations r on r.event_id = t.event_id and r.user_id = tm.user_id
  )
  select coalesce(
    (select university_override from t),
    case
      when (select count(distinct uni) from m where uni is not null) > 1 then 'mixed'
      when (select count(distinct uni) from m where uni is not null) = 1 then (select max(uni) from m)
      else 'other'
    end);
$$;

create or replace function public.set_team_university(p_team uuid, p_university text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.teams;
begin
  select * into v_t from public.teams where id = p_team for update;
  if v_t.id is null then raise exception 'Team not found.' using errcode = '22023'; end if;
  perform public.require_organiser(v_t.event_id);
  if p_university is not null and p_university not in ('cambridge', 'oxford', 'mixed', 'other') then
    raise exception 'Choose Cambridge, Oxford, mixed or other.' using errcode = '22023';
  end if;
  update public.teams set university_override = p_university where id = p_team;
  perform public.write_audit(v_t.event_id, 'team.university', 'team', p_team::text, jsonb_build_object('university', p_university, 'previous', v_t.university_override));
end $$;

-- ───────────────────────────── on-the-day controls ─────────────────────────────

-- Points can change during a race without re-publishing it: an override per layer, audited.
create table public.layer_points (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  layer_key text not null,
  points int not null check (points between 0 and 10000),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, layer_key)
);
alter table public.layer_points enable row level security;
create policy layer_points_read on public.layer_points for select using (true);
revoke insert, update, delete on public.layer_points from anon, authenticated;

create or replace function public.set_layer_points(p_tournament uuid, p_layer_key text, p_points int) returns void
language plpgsql security definer set search_path = public as $$
declare v_event uuid := public.tournament_event(p_tournament);
begin
  perform public.require_organiser(v_event);
  if p_points is null or p_points < 0 or p_points > 10000 then raise exception 'Points are between 0 and 10000.' using errcode = '22023'; end if;
  if not exists (select 1 from public.layer_runs where tournament_id = p_tournament and layer_key = p_layer_key)
     and not exists (select 1 from public.tournaments t join public.tournament_versions v on v.tournament_id = t.id and v.version = t.current_version
                     cross join lateral jsonb_array_elements(v.config -> 'layers') l where t.id = p_tournament and l ->> 'key' = p_layer_key) then
    raise exception 'Unknown layer.' using errcode = '22023';
  end if;
  insert into public.layer_points (tournament_id, layer_key, points, updated_by) values (p_tournament, p_layer_key, p_points, auth.uid())
  on conflict (tournament_id, layer_key) do update set points = excluded.points, updated_by = excluded.updated_by, updated_at = now();
  perform public.write_audit(v_event, 'layer.points', 'tournament', p_tournament::text, jsonb_build_object('layer', p_layer_key, 'points', p_points));
end $$;

-- Points for anything decided on the day (a challenge run off the platform, a judged bonus).
create table public.point_awards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  points int not null check (points between -10000 and 10000 and points <> 0),
  label text not null check (length(label) between 1 and 80),
  reason text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index point_awards_event on public.point_awards (event_id, team_id);
alter table public.point_awards enable row level security;
create policy point_awards_read on public.point_awards for select using (true);
revoke insert, update, delete on public.point_awards from anon, authenticated;

create or replace function public.award_points(p_event uuid, p_team uuid, p_points int, p_label text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  perform public.require_organiser(p_event);
  select name into v_name from public.teams where id = p_team and event_id = p_event;
  if v_name is null then raise exception 'That team is not in this event.' using errcode = '22023'; end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'Name what the points are for.' using errcode = '22023'; end if;
  insert into public.point_awards (event_id, team_id, points, label, reason, created_by)
  values (p_event, p_team, p_points, trim(p_label), coalesce(trim(p_reason), ''), auth.uid()) returning id into v_id;
  perform public.write_audit(p_event, 'points.award', 'team', p_team::text, jsonb_build_object('points', p_points, 'label', p_label, 'reason', p_reason));
  perform public.emit(p_event, null, 'points.awarded', true, jsonb_build_object('team', v_name, 'points', p_points, 'label', trim(p_label)));
  return v_id;
end $$;

create or replace function public.revoke_award(p_award uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.point_awards;
begin
  select * into v_a from public.point_awards where id = p_award for update;
  if v_a.id is null then raise exception 'Award not found.' using errcode = '22023'; end if;
  perform public.require_organiser(v_a.event_id);
  delete from public.point_awards where id = p_award;
  perform public.write_audit(v_a.event_id, 'points.revoke', 'team', v_a.team_id::text, jsonb_build_object('points', v_a.points, 'label', v_a.label, 'reason', p_reason));
end $$;

-- ───────────────────────────── leaderboard ─────────────────────────────

-- Live points per team across the event's public races. A layer's points count from its first
-- passed attempt (as soon as it's verified), or from an organiser's decision that it was passed.
-- Spectator-safe: team names, universities and totals only.
create or replace function public.event_leaderboard(p_event uuid)
returns table (
  team_id uuid, team_name text, university text, points int,
  build_done int, build_total int, challenges_done int, challenges_total int,
  award_points int, last_scored_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with t as (
    select id from public.tournaments
    where event_id = p_event and not simulation and archived_at is null
      and status in ('running', 'paused', 'completed')
  ),
  layers as (
    select r.id as run_id, r.tournament_id,
           coalesce(lp.points, (l ->> 'points')::int, 0) as pts,
           coalesce(l ->> 'category', 'challenge') as cat
    from public.layer_runs r
    join t on t.id = r.tournament_id
    join public.tournament_versions v on v.tournament_id = r.tournament_id and v.version = r.version
    cross join lateral jsonb_array_elements(v.config -> 'layers') l
    left join public.layer_points lp on lp.tournament_id = r.tournament_id and lp.layer_key = r.layer_key
    where l ->> 'key' = r.layer_key
  ),
  passes as (
    select a.participant_id, a.layer_run_id, min(a.finished_at) as at
    from public.verification_attempts a join layers on layers.run_id = a.layer_run_id
    where a.status = 'passed'
    group by 1, 2
    union
    select d.participant_id, d.layer_run_id, d.decided_at
    from public.advancement_decisions d join layers on layers.run_id = d.layer_run_id
    where d.decision in ('qualified', 'checkpoint_passed')
  ),
  scored as (
    select tp.team_id, p.layer_run_id, min(p.at) as at
    from passes p join public.tournament_participants tp on tp.id = p.participant_id
    where tp.team_id is not null
    group by 1, 2
  ),
  totals as (
    select count(*) filter (where cat = 'build_stage')::int as build_total,
           count(*) filter (where cat <> 'build_stage')::int as challenges_total
    from layers
  )
  select tm.id, tm.name, public.team_university(tm.id),
         (coalesce(sum(l.pts), 0) + coalesce((select sum(pa.points) from public.point_awards pa where pa.team_id = tm.id), 0))::int,
         count(*) filter (where l.cat = 'build_stage')::int,
         (select build_total from totals),
         count(*) filter (where l.cat is not null and l.cat <> 'build_stage')::int,
         (select challenges_total from totals),
         coalesce((select sum(pa.points) from public.point_awards pa where pa.team_id = tm.id), 0)::int,
         greatest(max(s.at), (select max(pa.created_at) from public.point_awards pa where pa.team_id = tm.id))
  from public.teams tm
  left join scored s on s.team_id = tm.id
  left join layers l on l.run_id = s.layer_run_id
  where tm.event_id = p_event
  group by tm.id, tm.name;
$$;

-- ───────────────────────────── finalists ─────────────────────────────

create table public.finalists (
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  rank int not null check (rank >= 1),
  points int not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id),
  primary key (event_id, team_id),
  unique (event_id, rank)
);
alter table public.finalists enable row level security;
create policy finalists_read on public.finalists for select using (true);
revoke insert, update, delete on public.finalists from anon, authenticated;

-- Organisers confirm the finalists on the day, in order, after seeing the leaderboard.
create or replace function public.confirm_finalists(p_event uuid, p_teams uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_n int := coalesce(array_length(p_teams, 1), 0);
begin
  perform public.require_organiser(p_event);
  if v_n = 0 then raise exception 'Choose at least one team.' using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(p_teams) x) <> v_n then raise exception 'A team is listed twice.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_teams) x where not exists (select 1 from public.teams where id = x and event_id = p_event)) then
    raise exception 'Every finalist must be a team in this event.' using errcode = '22023';
  end if;
  delete from public.finalists where event_id = p_event;
  insert into public.finalists (event_id, team_id, rank, points, confirmed_by)
  select p_event, x.team, x.ord::int, coalesce(lb.points, 0), auth.uid()
  from unnest(p_teams) with ordinality as x(team, ord)
  left join public.event_leaderboard(p_event) lb on lb.team_id = x.team;
  perform public.write_audit(p_event, 'finalists.confirm', 'event', p_event::text, jsonb_build_object('teams', p_teams));
  perform public.emit(p_event, null, 'finalists.confirmed', true,
    jsonb_build_object('teams', (select jsonb_agg(t.name order by x.ord) from unnest(p_teams) with ordinality as x(team, ord) join public.teams t on t.id = x.team)));
end $$;

create or replace function public.clear_finalists(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  delete from public.finalists where event_id = p_event;
  perform public.write_audit(p_event, 'finalists.clear', 'event', p_event::text, '{}'::jsonb);
end $$;

revoke execute on function public.team_university, public.set_team_university, public.event_leaderboard, public.confirm_finalists, public.clear_finalists, public.set_layer_points, public.award_points, public.revoke_award from public;
grant execute on function public.event_leaderboard, public.team_university to anon, authenticated;
grant execute on function public.set_team_university, public.confirm_finalists, public.clear_finalists, public.set_layer_points, public.award_points, public.revoke_award to authenticated;
