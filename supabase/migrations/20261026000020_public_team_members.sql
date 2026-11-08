-- Members' display names (never emails) for every team in an event, for the public leaderboard.

create or replace function public.public_team_members(p_event uuid)
returns table (team_id uuid, members text[])
language sql stable security definer set search_path = public as $$
  select t.id, coalesce(array_agg(coalesce(nullif(p.display_name, ''), 'Team member') order by m.joined_at) filter (where m.user_id is not null), '{}')
  from public.teams t
  left join public.team_members m on m.team_id = t.id
  left join public.profiles p on p.id = m.user_id
  where t.event_id = p_event
  group by t.id;
$$;
revoke execute on function public.public_team_members(uuid) from public;
grant execute on function public.public_team_members(uuid) to anon, authenticated;
