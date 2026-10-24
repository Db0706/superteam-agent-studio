-- A student waiting at their table should know who is coming. Profiles stay private to teammates
-- and staff; this returns only the first name (capitalised) of the mentor who claimed each of the caller's own
-- requests, and nothing about anyone else's.
create or replace function public.my_request_mentors(p_event uuid) returns table (request_id uuid, mentor_name text)
language sql stable security definer set search_path = public as $$
  select r.id, upper(left(n.first, 1)) || substr(n.first, 2)
  from public.mentor_requests r
  join public.profiles p on p.id = r.claimed_by
  cross join lateral (select split_part(trim(coalesce(nullif(p.display_name, ''), 'A mentor')), ' ', 1) as first) n
  where r.event_id = p_event and r.requester_id = auth.uid() and r.claimed_by is not null
$$;
revoke execute on function public.my_request_mentors(uuid) from public, anon;
grant execute on function public.my_request_mentors(uuid) to authenticated;
