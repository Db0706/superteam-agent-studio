-- Published winners for the public results page and leaderboard: project, team, university and
-- members' display names (never emails). Only rows an organiser has published are returned.

create or replace function public.public_winners(p_event uuid)
returns table (track public.official_track, place int, title text, project text, summary text, repo text, demo text, team text, university text, members text[])
language sql stable security definer set search_path = public as $$
  select w.track, w.place, w.title, s.title,
    left(coalesce(nullif(s.fields ->> 'description', ''), nullif(s.fields ->> 'problem', ''), ''), 400),
    nullif(s.fields ->> 'repo', ''), coalesce(nullif(s.fields ->> 'demo', ''), nullif(s.fields ->> 'document', '')),
    t.name, public.team_university(t.id),
    coalesce((select array_agg(coalesce(nullif(p.display_name, ''), 'Team member') order by m.joined_at)
              from public.team_members m left join public.profiles p on p.id = m.user_id where m.team_id = t.id), '{}')
  from public.winners w
  join public.submissions s on s.id = w.submission_id
  join public.teams t on t.id = s.team_id
  where w.event_id = p_event and w.published_at is not null
  order by w.track, w.place;
$$;
revoke execute on function public.public_winners(uuid) from public;
grant execute on function public.public_winners(uuid) to anon, authenticated;
