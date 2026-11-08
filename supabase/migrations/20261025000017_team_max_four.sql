-- Teams are limited to 4 people (organiser request, 25 Oct). Joining a full team is refused with a
-- clear message. The team row is locked first so two people joining at once can't make it 5.
-- Teams that already have more than 4 keep their members; nobody new can join them.

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
  perform 1 from public.teams where id = v_inv.team_id for update;
  if (select count(*) from public.team_members where team_id = v_inv.team_id) >= 4 then
    raise exception 'This team is full: teams have at most 4 people.' using errcode = '23514';
  end if;
  insert into public.team_members (team_id, event_id, user_id) values (v_inv.team_id, v_inv.event_id, v_uid);
  update public.team_invites set uses = uses + 1 where id = v_inv.id;
  return v_inv.team_id;
end $$;
