-- On-chain challenges (Operation, Minesweeper): each team registers a Solana devnet wallet, and
-- layers verified by a bureau.* plugin can be attempted without an app URL (they only read the
-- chain). The Challenge ID is derived from the team id in code (T- + first 8 hex characters).

alter table public.projects add column if not exists solana_wallet text
  check (solana_wallet is null or solana_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

create or replace function public.set_project_wallet(p_team uuid, p_wallet text) returns void
language plpgsql security definer set search_path = public as $$
declare v_wallet text := nullif(trim(coalesce(p_wallet, '')), '');
begin
  perform public.require_user();
  if not public.is_team_member(p_team) then raise exception 'Only team members can set the wallet.' using errcode = '42501'; end if;
  if v_wallet is not null and v_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception 'That isn''t a Solana address. Paste your wallet''s public address (32 to 44 letters and numbers).' using errcode = '22023';
  end if;
  update public.projects set solana_wallet = v_wallet, updated_at = now() where team_id = p_team;
end $$;
revoke execute on function public.set_project_wallet(uuid, text) from public, anon;
grant execute on function public.set_project_wallet(uuid, text) to authenticated;

create or replace function public.submit_attempt(p_id uuid, p_layer_key text, p_request_id text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_t public.tournaments; v_cfg jsonb; v_layer jsonb; v_lr public.layer_runs; v_p public.tournament_participants;
  v_count int; v_last timestamptz; v_max int; v_cooldown int; v_endpoint text; v_attempt uuid; v_prereq text;
begin
  select * into v_t from public.tournaments where id = p_id;
  if v_t.id is null or v_t.status <> 'running' then
    raise exception 'The tournament is not running right now%.', case when v_t.status = 'paused' then ' (paused by the organisers)' else '' end using errcode = '55000';
  end if;
  select * into v_p from public.tournament_participants where id = public.my_participant(p_id);
  if v_p.id is null then raise exception 'Your team has not joined this tournament.' using errcode = '42501'; end if;
  if v_p.state not in ('active', 'qualified') then
    raise exception 'Your team is no longer competing in this tournament. You can keep building and still submit to the event tracks.' using errcode = '55000';
  end if;
  if p_request_id is not null then
    select id into v_attempt from public.verification_attempts where participant_id = v_p.id and request_id = p_request_id;
    if v_attempt is not null then return v_attempt; end if;
  end if;
  select * into v_lr from public.layer_runs where tournament_id = p_id and layer_key = p_layer_key for update;
  if v_lr.id is null then raise exception 'Unknown layer.' using errcode = '22023'; end if;
  if v_lr.state <> 'open' or now() < v_lr.opens_at or now() >= v_lr.deadline_at then
    raise exception 'This layer is not open for attempts.' using errcode = '55000';
  end if;
  select config into v_cfg from public.tournament_versions where tournament_id = p_id and version = v_lr.version;
  select l into v_layer from jsonb_array_elements(v_cfg -> 'layers') l where l ->> 'key' = p_layer_key;
  for v_prereq in select jsonb_array_elements_text(coalesce(v_layer -> 'prerequisites', '[]'::jsonb)) loop
    if not exists (
      select 1 from public.verification_attempts a join public.layer_runs r on r.id = a.layer_run_id
      where a.participant_id = v_p.id and r.layer_key = v_prereq and a.status = 'passed'
    ) then
      raise exception 'Pass "%" first.', v_prereq using errcode = '55000';
    end if;
  end loop;
  select count(*), max(submitted_at) into v_count, v_last from public.verification_attempts where layer_run_id = v_lr.id and participant_id = v_p.id;
  v_max := nullif(v_layer #>> '{retries,maxAttempts}', '')::int;
  v_cooldown := coalesce((v_layer #>> '{retries,cooldownSeconds}')::int, 30);
  if v_max is not null and v_count >= v_max then raise exception 'No attempts left for this layer (% allowed).', v_max using errcode = '55000'; end if;
  if v_last is not null and v_last + make_interval(secs => v_cooldown) > now() then
    raise exception 'Wait % more seconds before the next attempt.', ceil(extract(epoch from (v_last + make_interval(secs => v_cooldown) - now()))) using errcode = '55000';
  end if;
  if exists (select 1 from public.verification_attempts where layer_run_id = v_lr.id and participant_id = v_p.id and status in ('queued', 'running')) then
    raise exception 'Your previous attempt is still being verified.' using errcode = '55000';
  end if;
  v_endpoint := coalesce(v_p.fixture_endpoint, (select endpoint_url from public.projects where team_id = v_p.team_id));
  -- On-chain challenges (bureau.*) read Solana devnet and never call the team's app.
  if v_endpoint is null and coalesce(v_layer #>> '{verifier,plugin}', '') like 'bureau.%' then v_endpoint := 'onchain:'; end if;
  if v_endpoint is null then raise exception 'Add your app''s URL on the team page first.' using errcode = '22023'; end if;
  insert into public.verification_attempts (tournament_id, layer_run_id, participant_id, attempt_no, version, submitted_by, endpoint_url, request_id)
  values (p_id, v_lr.id, v_p.id, v_count + 1, v_lr.version, v_uid, v_endpoint, p_request_id) returning id into v_attempt;
  insert into public.verification_jobs (attempt_id) values (v_attempt);
  perform public.emit(v_t.event_id, p_id, 'attempt.submitted', true, jsonb_build_object('layer', p_layer_key));
  return v_attempt;
end $$;
