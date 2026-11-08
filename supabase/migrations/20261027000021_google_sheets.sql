-- Google Sheets for judging. An organiser connects their Google account once per event; the
-- server keeps the refresh token ENCRYPTED (key held only by the web server, never in the
-- database), and the id of the judging sheet it created. Organiser-only, through these functions.

create table if not exists public.google_connections (
  event_id uuid primary key references public.events(id) on delete cascade,
  connected_by uuid references auth.users(id) on delete set null,
  google_email text not null,
  refresh_token_enc text not null,
  spreadsheet_id text,
  spreadsheet_url text,
  updated_at timestamptz not null default now()
);
alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;

create or replace function public.google_connection_save(p_event uuid, p_email text, p_token_enc text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  insert into public.google_connections (event_id, connected_by, google_email, refresh_token_enc)
  values (p_event, auth.uid(), lower(trim(p_email)), p_token_enc)
  on conflict (event_id) do update set connected_by = excluded.connected_by, google_email = excluded.google_email,
    refresh_token_enc = excluded.refresh_token_enc, updated_at = now();
  perform public.write_audit(p_event, 'google.connect', 'event', p_event::text, jsonb_build_object('email', lower(trim(p_email))));
end $$;

create or replace function public.google_connection_get(p_event uuid)
returns table (google_email text, refresh_token_enc text, spreadsheet_id text, spreadsheet_url text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  return query select c.google_email, c.refresh_token_enc, c.spreadsheet_id, c.spreadsheet_url from public.google_connections c where c.event_id = p_event;
end $$;

create or replace function public.google_sheet_set(p_event uuid, p_id text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  update public.google_connections set spreadsheet_id = p_id, spreadsheet_url = p_url, updated_at = now() where event_id = p_event;
  perform public.write_audit(p_event, 'google.sheet', 'event', p_event::text, jsonb_build_object('spreadsheet', p_id));
end $$;

create or replace function public.google_connection_clear(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  delete from public.google_connections where event_id = p_event;
  perform public.write_audit(p_event, 'google.disconnect', 'event', p_event::text, '{}'::jsonb);
end $$;

revoke execute on function public.google_connection_save(uuid, text, text), public.google_connection_get(uuid),
  public.google_sheet_set(uuid, text, text), public.google_connection_clear(uuid) from public, anon;
grant execute on function public.google_connection_save(uuid, text, text), public.google_connection_get(uuid),
  public.google_sheet_set(uuid, text, text), public.google_connection_clear(uuid) to authenticated;
