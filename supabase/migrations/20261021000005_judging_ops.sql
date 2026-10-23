-- Judging operations: validated rubrics, safer scoring, assignment and winner management.
-- Rubric writes now go through save_rubric so weights, keys and confirmation are checked and audited.

drop policy if exists rubrics_admin on public.judging_rubrics;
revoke insert, update, delete on public.judging_rubrics from anon, authenticated;

create or replace function public.save_rubric(p_event uuid, p_track public.official_track, p_name text, p_criteria jsonb, p_confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_keys int; v_n int; v_old public.judging_rubrics;
begin
  perform public.require_organiser(p_event);
  if jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) = 0 then
    raise exception 'Add at least one criterion.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_criteria) c
    where coalesce(c->>'key', '') !~ '^[a-z][a-z0-9_]{0,39}$'
       or coalesce(trim(c->>'name'), '') = ''
       or jsonb_typeof(c->'weight') <> 'number' or (c->>'weight')::numeric <= 0
       or jsonb_typeof(c->'max') <> 'number' or (c->>'max')::numeric not between 1 and 100
  ) then
    raise exception 'Each criterion needs a key (lowercase letters, digits, underscores), a name, a positive weight and a max between 1 and 100.' using errcode = '22023';
  end if;
  select sum((c->>'weight')::numeric), count(distinct c->>'key'), count(*) into v_total, v_keys, v_n from jsonb_array_elements(p_criteria) c;
  if v_keys <> v_n then raise exception 'Criterion keys must be unique.' using errcode = '22023'; end if;
  if v_total <> 100 then raise exception 'Weights must add up to 100 (they add up to %).', v_total using errcode = '22023'; end if;

  select * into v_old from public.judging_rubrics where event_id = p_event and track = p_track;
  if v_old.id is not null and v_old.criteria is distinct from p_criteria and exists (
    select 1 from public.judging_scores sc join public.judge_assignments a on a.id = sc.assignment_id
    join public.submissions s on s.id = a.submission_id
    where s.event_id = p_event and s.track = p_track and sc.final
  ) then
    raise exception 'Judges have already submitted final scores against these criteria. Reopen those scores before changing them.' using errcode = '55000';
  end if;

  insert into public.judging_rubrics (event_id, track, name, criteria, status, updated_at)
  values (p_event, p_track, coalesce(nullif(trim(p_name), ''), initcap(p_track::text) || ' rubric'), p_criteria,
          case when p_confirm then 'confirmed'::public.confirmation else 'proposed'::public.confirmation end, now())
  on conflict (event_id, track) do update set name = excluded.name, criteria = excluded.criteria, status = excluded.status, updated_at = now();
  perform public.write_audit(p_event, case when p_confirm then 'rubric.confirm' else 'rubric.save' end, 'rubric', p_track::text,
    jsonb_build_object('criteria', p_criteria, 'previous_status', v_old.status));
end $$;

-- Final scores must match the rubric exactly: every criterion, within its max.
create or replace function public.save_judging_score(p_assignment uuid, p_scores jsonb, p_comments text, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.judge_assignments; v_s public.judging_scores; v_criteria jsonb;
begin
  select * into v_a from public.judge_assignments where id = p_assignment for update;
  if v_a.judge_id is distinct from auth.uid() then raise exception 'This is not your assignment.' using errcode = '42501'; end if;
  if v_a.status = 'conflict' then raise exception 'You flagged a conflict of interest for this submission.' using errcode = '55000'; end if;
  select * into v_s from public.judging_scores where assignment_id = p_assignment for update;
  if v_s.final then raise exception 'You already submitted final scores for this submission.' using errcode = '55000'; end if;
  select r.criteria into v_criteria from public.judging_rubrics r join public.submissions s on s.event_id = r.event_id and s.track = r.track where s.id = v_a.submission_id;
  if v_criteria is null then raise exception 'There are no criteria for this track yet.' using errcode = '55000'; end if;
  if jsonb_typeof(coalesce(p_scores, '{}')) <> 'object' then raise exception 'Scores must be an object.' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_each(coalesce(p_scores, '{}')) e
    where not exists (select 1 from jsonb_array_elements(v_criteria) c where c->>'key' = e.key)
       or jsonb_typeof(e.value) <> 'number'
       or (e.value)::text::numeric < 0
       or (e.value)::text::numeric > (select (c->>'max')::numeric from jsonb_array_elements(v_criteria) c where c->>'key' = e.key)
  ) then
    raise exception 'A score is outside its criterion''s range.' using errcode = '22023';
  end if;
  if p_final and exists (select 1 from jsonb_array_elements(v_criteria) c where not (coalesce(p_scores, '{}') ? (c->>'key'))) then
    raise exception 'Score every criterion before submitting final scores.' using errcode = '22023';
  end if;
  update public.judging_scores set scores = coalesce(p_scores, '{}'), comments = coalesce(p_comments, ''), final = p_final,
    submitted_at = case when p_final then now() else null end, updated_at = now() where assignment_id = p_assignment;
  update public.judge_assignments set status = case when p_final then 'submitted' else 'in_progress' end where id = p_assignment;
  if p_final then
    perform public.write_audit(v_a.event_id, 'judging.final', 'judge_assignment', p_assignment::text, jsonb_build_object('submission', v_a.submission_id));
  end if;
end $$;

create or replace function public.unassign_judge(p_assignment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.judge_assignments;
begin
  select * into v_a from public.judge_assignments where id = p_assignment for update;
  if v_a.id is null then raise exception 'Assignment not found.' using errcode = '22023'; end if;
  perform public.require_organiser(v_a.event_id);
  if exists (select 1 from public.judging_scores where assignment_id = p_assignment and final) then
    raise exception 'This judge has submitted final scores. Reopen them instead of removing the assignment.' using errcode = '55000';
  end if;
  delete from public.judge_assignments where id = p_assignment;
  perform public.write_audit(v_a.event_id, 'judging.unassign', 'judge_assignment', p_assignment::text, jsonb_build_object('judge', v_a.judge_id, 'submission', v_a.submission_id));
end $$;

-- Organiser handles a judge's flag: answer a clarification, accept a conflict, or reopen final scores.
create or replace function public.resolve_judging(p_assignment uuid, p_action text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.judge_assignments;
begin
  select * into v_a from public.judge_assignments where id = p_assignment for update;
  if v_a.id is null then raise exception 'Assignment not found.' using errcode = '22023'; end if;
  perform public.require_organiser(v_a.event_id);
  if p_action = 'answer' then
    if v_a.status <> 'clarification' then raise exception 'There is no open clarification.' using errcode = '55000'; end if;
    update public.judge_assignments set status = 'in_progress', conflict_note = coalesce(conflict_note, '') || E'\nOrganiser: ' || coalesce(p_note, '') where id = p_assignment;
  elsif p_action = 'reopen' then
    update public.judging_scores set final = false, submitted_at = null, updated_at = now() where assignment_id = p_assignment;
    update public.judge_assignments set status = 'in_progress' where id = p_assignment;
  elsif p_action = 'clear_conflict' then
    if v_a.status <> 'conflict' then raise exception 'There is no conflict to clear.' using errcode = '55000'; end if;
    update public.judge_assignments set status = 'assigned', conflict_note = null where id = p_assignment;
  else
    raise exception 'Unknown action.' using errcode = '22023';
  end if;
  perform public.write_audit(v_a.event_id, 'judging.' || p_action, 'judge_assignment', p_assignment::text, jsonb_build_object('note', p_note));
end $$;

-- Winners must be final submissions in the right event and track.
create or replace function public.publish_winner(p_event uuid, p_track public.official_track, p_submission uuid, p_place int, p_title text) returns void
language plpgsql security definer set search_path = public as $$
declare v_s public.submissions;
begin
  perform public.require_organiser(p_event);
  select * into v_s from public.submissions where id = p_submission;
  if v_s.id is null or v_s.event_id <> p_event or v_s.track <> p_track then
    raise exception 'That submission is not in this track.' using errcode = '22023';
  end if;
  if v_s.status <> 'submitted' then raise exception 'Only final submissions can win.' using errcode = '55000'; end if;
  if not exists (select 1 from public.judging_rubrics where event_id = p_event and track = p_track and status = 'confirmed') then
    raise exception 'Confirm this track''s judging criteria before publishing winners.' using errcode = '55000';
  end if;
  if exists (select 1 from public.winners where event_id = p_event and track = p_track and submission_id = p_submission and place <> p_place) then
    raise exception 'That submission already holds another place in this track.' using errcode = '23505';
  end if;
  insert into public.winners (event_id, track, submission_id, place, title, published_at, published_by)
  values (p_event, p_track, p_submission, p_place, coalesce(p_title, ''), now(), auth.uid())
  on conflict (event_id, track, place) do update set submission_id = excluded.submission_id, title = excluded.title, published_at = now(), published_by = auth.uid();
  perform public.write_audit(p_event, 'winner.publish', 'submission', p_submission::text, jsonb_build_object('track', p_track, 'place', p_place));
  perform public.emit(p_event, null, 'winner.published', true, jsonb_build_object('track', p_track, 'place', p_place, 'title', p_title,
    'team', (select name from public.teams where id = v_s.team_id), 'project', v_s.title));
end $$;

create or replace function public.unpublish_winner(p_event uuid, p_track public.official_track, p_place int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_organiser(p_event);
  delete from public.winners where event_id = p_event and track = p_track and place = p_place;
  perform public.write_audit(p_event, 'winner.unpublish', 'winner', p_track::text || ':' || p_place, '{}'::jsonb);
end $$;

revoke execute on function public.save_rubric, public.unassign_judge, public.resolve_judging, public.unpublish_winner from public, anon;
grant execute on function public.save_rubric, public.unassign_judge, public.resolve_judging, public.unpublish_winner, public.save_judging_score, public.publish_winner to authenticated;

-- Deleting an event cascades to rows with audit triggers; those audit rows must not point at the
-- event being deleted, or the delete fails. They keep the event id in their details instead.
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_event uuid := nullif(v_row ->> 'event_id', '')::uuid;
begin
  if v_event is not null and not exists (select 1 from public.events where id = v_event) then
    v_event := null;
  end if;
  insert into public.audit_logs (event_id, actor_id, action, target_type, target_id, details)
  values (
    v_event,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    jsonb_build_object('event_id', v_row ->> 'event_id', 'old', case when tg_op <> 'INSERT' then to_jsonb(old) end, 'new', case when tg_op <> 'DELETE' then to_jsonb(new) end)
  );
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
