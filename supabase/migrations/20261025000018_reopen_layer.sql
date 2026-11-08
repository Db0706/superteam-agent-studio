-- Reopen a step that has already closed, in a points race (nobody is eliminated, so there is no
-- decision to undo beyond the step's own result). The step opens again until now + p_seconds; its
-- recorded results are cleared and decided again when it closes. Points are safe meanwhile: the
-- leaderboard counts passed attempts as well as decisions.

create or replace function public.reopen_layer(p_layer_run uuid, p_seconds int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_lr public.layer_runs; v_t public.tournaments; v_mode text;
begin
  select * into v_lr from public.layer_runs where id = p_layer_run for update;
  select * into v_t from public.tournaments where id = v_lr.tournament_id for update;
  perform public.require_organiser(v_t.event_id);
  if p_seconds < 60 or p_seconds > 24 * 3600 then raise exception 'Reopen for between 1 minute and 24 hours.' using errcode = '22023'; end if;
  if v_t.status not in ('running', 'paused') then raise exception 'The race has to be running to reopen a step.' using errcode = '55000'; end if;
  select config ->> 'mode' into v_mode from public.tournament_versions where tournament_id = v_t.id and version = v_t.current_version;
  if coalesce(v_mode, '') <> 'checkpoint' then raise exception 'Only points races can reopen a step.' using errcode = '55000'; end if;
  if v_lr.state <> 'closed' then raise exception 'This step is not closed. Extend it instead.' using errcode = '55000'; end if;
  delete from public.advancement_decisions where layer_run_id = p_layer_run;
  update public.layer_runs set state = 'open', deadline_at = now() + make_interval(secs => p_seconds),
    extended_seconds = extended_seconds + p_seconds, closing_at = null, finalising_at = null, closed_at = null
  where id = p_layer_run;
  perform public.write_audit(v_t.event_id, 'layer.reopen', 'layer_run', p_layer_run::text, jsonb_build_object('seconds', p_seconds, 'reason', p_reason));
  perform public.emit(v_t.event_id, v_t.id, 'layer.extended', not v_t.simulation, jsonb_build_object('layer', v_lr.layer_key, 'seconds', p_seconds));
end $$;
revoke execute on function public.reopen_layer(uuid, int, text) from public, anon;
grant execute on function public.reopen_layer(uuid, int, text) to authenticated;
