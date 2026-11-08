-- Hardening: internal helpers must not be callable from the browser. Postgres grants EXECUTE to
-- PUBLIC by default, so without this any signed-in user could forge audit rows (write_audit) or
-- post fake public activity to the venue screen (emit).
revoke execute on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.emit(uuid, uuid, text, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Approved-attendee import from the Luma guest CSV (parsed and previewed in the app).
-- p_rows: [{ email, full_name, ticket: hackathon|panel, status: approved|pending|declined|checked_in, university, external_id, checked_in_at }]
create or replace function public.import_registrations(p_event uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb; v_inserted int := 0; v_updated int := 0; v_unchanged int := 0; v_linked int := 0;
  v_email text; v_existing public.registrations; v_user uuid;
begin
  perform public.require_organiser(p_event);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send between 1 and 5000 rows.' using errcode = '22023';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(trim(v_row ->> 'email'));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then continue; end if;
    select * into v_existing from public.registrations where event_id = p_event and email = v_email for update;
    if v_existing.id is null then
      insert into public.registrations (event_id, email, full_name, ticket, status, university, external_id, checked_in_at, source)
      values (p_event, v_email, coalesce(v_row ->> 'full_name', ''), (v_row ->> 'ticket')::public.ticket_type, (v_row ->> 'status')::public.registration_status,
              nullif(v_row ->> 'university', ''), nullif(v_row ->> 'external_id', ''), nullif(v_row ->> 'checked_in_at', '')::timestamptz, 'luma_csv');
      v_inserted := v_inserted + 1;
    elsif v_existing.ticket::text is distinct from v_row ->> 'ticket' or v_existing.status::text is distinct from v_row ->> 'status' or v_existing.full_name is distinct from coalesce(v_row ->> 'full_name', '') then
      update public.registrations set full_name = coalesce(v_row ->> 'full_name', full_name), ticket = (v_row ->> 'ticket')::public.ticket_type,
        status = (v_row ->> 'status')::public.registration_status, university = coalesce(nullif(v_row ->> 'university', ''), university),
        external_id = coalesce(nullif(v_row ->> 'external_id', ''), external_id), checked_in_at = coalesce(nullif(v_row ->> 'checked_in_at', '')::timestamptz, checked_in_at)
      where id = v_existing.id;
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;
    -- People who already signed in get linked now; others are linked by the signup trigger.
    select id into v_user from auth.users where lower(email) = v_email;
    if v_user is not null then
      update public.registrations set user_id = v_user where event_id = p_event and email = v_email and user_id is null;
      if (v_row ->> 'ticket') = 'hackathon' and (v_row ->> 'status') in ('approved', 'checked_in') then
        insert into public.event_roles (event_id, user_id, role, granted_by) values (p_event, v_user, 'participant', auth.uid()) on conflict do nothing;
        v_linked := v_linked + 1;
      elsif (v_row ->> 'status') = 'declined' then
        delete from public.event_roles where event_id = p_event and user_id = v_user and role = 'participant';
      end if;
    end if;
  end loop;
  perform public.write_audit(p_event, 'registrations.import', 'event', p_event::text,
    jsonb_build_object('rows', jsonb_array_length(p_rows), 'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged, 'linked', v_linked));
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged, 'linked', v_linked);
end $$;

-- Grant or revoke an event role by email. The person must have signed in once.
create or replace function public.set_event_role(p_event uuid, p_email text, p_role public.event_role, p_grant boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform public.require_organiser(p_event);
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No account for %. Ask them to sign in once at /login, then try again.', p_email using errcode = '22023'; end if;
  if p_grant then
    insert into public.event_roles (event_id, user_id, role, granted_by) values (p_event, v_user, p_role, auth.uid()) on conflict do nothing;
  else
    if p_role = 'organiser' and v_user = auth.uid() then raise exception 'You can''t remove your own organiser role.' using errcode = '42501'; end if;
    delete from public.event_roles where event_id = p_event and user_id = v_user and role = p_role;
  end if;
end $$;

create or replace function public.check_in(p_registration uuid, p_checked_in boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_r public.registrations;
begin
  select * into v_r from public.registrations where id = p_registration for update;
  perform public.require_organiser(v_r.event_id);
  update public.registrations set checked_in_at = case when p_checked_in then now() else null end,
    status = case when p_checked_in then 'checked_in' when status = 'checked_in' then 'approved' else status end
  where id = p_registration;
end $$;

-- Announcements are published through a function so the public feed can't be written directly.
create or replace function public.publish_announcement(p_event uuid, p_title text, p_body text, p_audience text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.require_organiser(p_event);
  if coalesce(trim(p_title), '') = '' then raise exception 'Add a title.' using errcode = '22023'; end if;
  insert into public.announcements (event_id, title, body, audience, published_at, created_by)
  values (p_event, trim(p_title), coalesce(p_body, ''), p_audience, now(), auth.uid()) returning id into v_id;
  if p_audience = 'everyone' then
    perform public.emit(p_event, null, 'announcement', true, jsonb_build_object('title', trim(p_title)));
  end if;
  return v_id;
end $$;
