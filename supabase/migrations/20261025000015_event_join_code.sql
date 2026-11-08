-- Joining with an event code, for events without a guest list to import. The organiser sets a
-- short code and shows it in the room; a signed-in person who enters it (and picks their
-- university) is added to the participant list, exactly as a Luma import would. Strangers online
-- don't have the code. A Luma import still works alongside it.

-- Its own table, not a column on events: events are publicly readable, the code must not be.
create table if not exists public.event_join_codes (
  event_id uuid primary key references public.events(id) on delete cascade,
  code text not null,
  updated_at timestamptz not null default now()
);
alter table public.event_join_codes enable row level security;
revoke all on public.event_join_codes from anon, authenticated;

create or replace function public.set_join_code(p_event uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text := nullif(upper(trim(coalesce(p_code, ''))), '');
begin
  perform public.require_organiser(p_event);
  if v_code is not null and v_code !~ '^[A-Z0-9-]{4,20}$' then
    raise exception 'Use 4 to 20 letters or numbers for the code.' using errcode = '22023';
  end if;
  if v_code is null then delete from public.event_join_codes where event_id = p_event;
  else insert into public.event_join_codes (event_id, code) values (p_event, v_code)
    on conflict (event_id) do update set code = excluded.code, updated_at = now();
  end if;
  perform public.write_audit(p_event, 'event.join_code', 'event', p_event::text, jsonb_build_object('set', v_code is not null));
end $$;

create or replace function public.join_with_code(p_event uuid, p_code text, p_university text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_code text;
  v_email text;
  v_name text;
  v_uni text;
begin
  select code into v_code from public.event_join_codes where event_id = p_event;
  if v_code is null or upper(trim(coalesce(p_code, ''))) <> v_code then
    raise exception 'That code isn''t right. Check the code on the screen in the room.' using errcode = '42501';
  end if;
  v_uni := case lower(coalesce(p_university, ''))
    when 'cambridge' then 'University of Cambridge'
    when 'oxford' then 'University of Oxford'
    when 'other' then 'Other'
    else null end;
  if v_uni is null then raise exception 'Choose Cambridge, Oxford or Other.' using errcode = '22023'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  select coalesce(nullif(display_name, ''), split_part(v_email, '@', 1)) into v_name from public.profiles where id = v_uid;
  insert into public.registrations (event_id, email, full_name, ticket, status, university, user_id, source)
  values (p_event, v_email, coalesce(v_name, ''), 'hackathon', 'approved', v_uni, v_uid, 'event_code')
  on conflict (event_id, email) do update set
    user_id = excluded.user_id,
    university = coalesce(public.registrations.university, excluded.university),
    status = case when public.registrations.status in ('approved', 'checked_in', 'declined') then public.registrations.status else 'approved' end,
    ticket = case when public.registrations.ticket = 'panel' then public.registrations.ticket else 'hackathon' end;
  if exists (select 1 from public.registrations where event_id = p_event and email = v_email and status = 'declined') then
    raise exception 'Your registration was declined. Speak to an organiser at the desk.' using errcode = '42501';
  end if;
  if exists (select 1 from public.registrations where event_id = p_event and email = v_email and ticket = 'panel') then
    raise exception 'Your registration is for the panel talks only. Speak to an organiser at the desk.' using errcode = '42501';
  end if;
  insert into public.event_roles (event_id, user_id, role) values (p_event, v_uid, 'participant') on conflict do nothing;
end $$;

revoke execute on function public.set_join_code(uuid, text), public.join_with_code(uuid, text, text) from public, anon;
grant execute on function public.set_join_code(uuid, text), public.join_with_code(uuid, text, text) to authenticated;

-- Organisers read the current code through this function only.
create or replace function public.event_join_code(p_event uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  return (select code from public.event_join_codes where event_id = p_event);
end $$;
revoke execute on function public.event_join_code(uuid) from public, anon;
grant execute on function public.event_join_code(uuid) to authenticated;
