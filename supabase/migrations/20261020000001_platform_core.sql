-- Agent Studio 2.0: events, people, teams, tournaments, verification, operations.
--
-- Rules this schema enforces (see docs/PLATFORM_ARCHITECTURE.md):
--  * Every event-scoped row carries event_id; RLS isolates events and teams.
--  * Browsers never write tournament state, attempts' results, decisions or receipts.
--    Participants act through SECURITY DEFINER functions that check permissions and use
--    the database clock. The verification worker uses the service role.
--  * Critical transitions are guarded by state checks and unique constraints, so retried
--    jobs and overlapping schedulers produce each observable result exactly once.

create extension if not exists pgcrypto;

-- ───────────────────────────── enums ─────────────────────────────

create type public.event_role as enum ('participant', 'mentor', 'judge', 'organiser');
create type public.ticket_type as enum ('hackathon', 'panel');
create type public.registration_status as enum ('approved', 'pending', 'declined', 'checked_in');
create type public.official_track as enum ('build', 'policy');
create type public.tournament_status as enum ('draft', 'published', 'scheduled', 'running', 'paused', 'finalising', 'completed', 'cancelled');
create type public.tournament_mode as enum ('survival', 'ranked', 'checkpoint', 'hybrid');
create type public.participation_kind as enum ('team', 'individual');
create type public.layer_state as enum ('locked', 'scheduled', 'open', 'closing', 'finalising', 'closed');
create type public.participant_state as enum ('registered', 'active', 'qualified', 'eliminated', 'completed', 'withdrawn');
create type public.attempt_status as enum ('queued', 'running', 'passed', 'failed', 'error', 'review_required');
create type public.job_status as enum ('queued', 'leased', 'done', 'dead');
create type public.decision_kind as enum ('qualified', 'eliminated', 'checkpoint_passed', 'checkpoint_missed');
create type public.mentor_status as enum ('open', 'claimed', 'resolved', 'escalated');
create type public.submission_status as enum ('draft', 'submitted', 'reopened');
create type public.confirmation as enum ('confirmed', 'proposed', 'sample', 'tbc');

-- ───────────────────────────── events & people ─────────────────────────────

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  name text not null,
  short_name text not null,
  timezone text not null default 'Europe/London',
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'live', 'closed')),
  -- Venue, agenda, prizes, organisers: each fact carries its own confirmation and source.
  details jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_tracks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  track public.official_track not null,
  name text not null,
  description text not null default '',
  status public.confirmation not null default 'tbc',
  submissions_open_at timestamptz,
  submissions_close_at timestamptz,
  unique (event_id, track)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  university text,
  discipline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table public.event_roles (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.event_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  primary key (event_id, user_id, role)
);

-- Approved attendees from the event's ticketing (Luma CSV). Matched to accounts by email.
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text not null default '',
  ticket public.ticket_type not null,
  status public.registration_status not null,
  university text,
  track_interest public.official_track,
  user_id uuid references auth.users (id) on delete set null,
  source text not null default 'luma_csv',
  external_id text,
  imported_at timestamptz not null default now(),
  checked_in_at timestamptz,
  unique (event_id, email)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(name) between 2 and 60),
  track public.official_track,
  captain_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('captain', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  -- One team per person per event.
  unique (event_id, user_id)
);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null unique default encode(gen_random_bytes(9), 'base64'),
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 6 check (max_uses between 1 and 20),
  uses int not null default 0,
  revoked_at timestamptz
);

-- What a team is building. endpoint_url is where the verifier calls their app (ASRP/1).
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null default '',
  repo_url text,
  demo_url text,
  endpoint_url text,
  -- Bearer token the verifier sends so the app knows the platform is calling. Readable by the team.
  verifier_token text not null default encode(gen_random_bytes(24), 'hex'),
  endpoint_checked_at timestamptz,
  endpoint_check jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id)
);

-- ───────────────────────────── tournaments ─────────────────────────────

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  description text not null default '',
  status public.tournament_status not null default 'draft',
  -- The editable draft. Publishing validates it and freezes a copy in tournament_versions.
  draft_config jsonb not null,
  current_version int,
  -- Rehearsals run on fixture teams and never affect real participants.
  simulation boolean not null default false,
  starts_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  eliminations_suspended boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_versions (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  version int not null,
  config jsonb not null,
  config_hash text not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id),
  note text not null default '',
  primary key (tournament_id, version)
);

-- One row per layer of the running version: the layer state machine lives here.
create table public.layer_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  version int not null,
  layer_key text not null,
  position int not null,
  state public.layer_state not null default 'locked',
  opens_at timestamptz not null,
  deadline_at timestamptz not null,
  opened_at timestamptz,
  closing_at timestamptz,
  finalising_at timestamptz,
  closed_at timestamptz,
  extended_seconds int not null default 0,
  unique (tournament_id, position),
  unique (tournament_id, layer_key),
  check (deadline_at > opens_at),
  foreign key (tournament_id, version) references public.tournament_versions (tournament_id, version)
);

create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  display_name text not null,
  state public.participant_state not null default 'registered',
  eliminated_layer_key text,
  eliminated_at timestamptz,
  -- Simulation fixtures point at reference apps; real teams use their project's endpoint.
  fixture_endpoint text,
  joined_at timestamptz not null default now(),
  -- Exactly one of: a team, a person, or (rehearsals only) a fixture app.
  check ((team_id is not null)::int + (user_id is not null)::int + (fixture_endpoint is not null)::int = 1),
  unique (tournament_id, team_id),
  unique (tournament_id, user_id)
);

create table public.verification_attempts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  layer_run_id uuid not null references public.layer_runs (id) on delete cascade,
  participant_id uuid not null references public.tournament_participants (id) on delete cascade,
  attempt_no int not null,
  version int not null,
  -- Durable server timestamp: decides whether an attempt was in time, whatever the queue does.
  submitted_at timestamptz not null default now(),
  submitted_by uuid references auth.users (id),
  endpoint_url text not null,
  status public.attempt_status not null default 'queued',
  score numeric(6, 2),
  -- Safe, participant-facing feedback per check. Never hidden inputs or expected values.
  feedback jsonb not null default '[]'::jsonb,
  -- Organiser-only evidence: requests, responses (truncated), tool receipts, timings.
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  unique (layer_run_id, participant_id, attempt_no)
);

create table public.verification_jobs (
  id bigint generated always as identity primary key,
  attempt_id uuid not null unique references public.verification_attempts (id) on delete cascade,
  status public.job_status not null default 'queued',
  run_after timestamptz not null default now(),
  tries int not null default 0,
  max_tries int not null default 3,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verification_jobs_ready on public.verification_jobs (status, run_after);

create table public.verification_receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.verification_attempts (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  participant_id uuid not null references public.tournament_participants (id) on delete cascade,
  layer_key text not null,
  payload jsonb not null,
  -- HMAC-SHA256 over the canonical payload with the platform's receipt key.
  signature text not null,
  issued_at timestamptz not null default now()
);

-- Per-attempt hidden test data for the reference challenge services (tools, knowledge, faults).
create table public.challenge_sessions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.verification_attempts (id) on delete cascade,
  token text not null unique,
  kind text not null,
  facts jsonb not null default '{}'::jsonb,
  behaviour jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Trusted instrumentation: written only by the reference tool service, never by participants.
create table public.tool_invocations (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.challenge_sessions (id) on delete cascade,
  tool text not null,
  input jsonb not null,
  output jsonb,
  status int not null,
  received_at timestamptz not null default clock_timestamp()
);
create index tool_invocations_session on public.tool_invocations (session_id, received_at);

create table public.advancement_decisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  layer_run_id uuid not null references public.layer_runs (id) on delete cascade,
  participant_id uuid not null references public.tournament_participants (id) on delete cascade,
  decision public.decision_kind not null,
  reason text not null,
  best_attempt_id uuid references public.verification_attempts (id),
  score numeric(6, 2),
  rank int,
  decided_at timestamptz not null default now(),
  overridden_by uuid references auth.users (id),
  overridden_at timestamptz,
  override_reason text,
  -- Exactly one decision per participant per layer, however often finalisation runs.
  unique (layer_run_id, participant_id)
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  participant_id uuid not null references public.tournament_participants (id) on delete cascade,
  layer_key text not null,
  title text not null,
  awarded_at timestamptz not null default now(),
  unique (participant_id, layer_key)
);

-- ───────────────────────────── live feed, support, submissions, judging ─────────────────────────────

create table public.activity_events (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete cascade,
  kind text not null,
  -- Public events contain only spectator-safe data (team names, layer titles, counts).
  is_public boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_feed on public.activity_events (event_id, id desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null,
  body text not null default '',
  audience text not null default 'everyone' check (audience in ('everyone', 'participants', 'mentors', 'judges', 'organisers')),
  published_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.mentor_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  requester_id uuid not null references auth.users (id),
  category text not null check (category in ('setup', 'ai', 'verification', 'deployment', 'debugging', 'research', 'other')),
  description text not null check (length(description) between 3 and 2000),
  location text not null default '',
  status public.mentor_status not null default 'open',
  claimed_by uuid references auth.users (id),
  claimed_at timestamptz,
  resolved_at timestamptz,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  track public.official_track not null,
  status public.submission_status not null default 'draft',
  title text not null default '',
  fields jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  submitted_by uuid references auth.users (id),
  receipt_code text,
  reopened_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (event_id, team_id, track)
);

create table public.submission_artifacts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('screenshot', 'document', 'slides', 'link')),
  label text not null default '',
  storage_path text,
  url text,
  created_at timestamptz not null default now(),
  check ((storage_path is null) <> (url is null))
);

create table public.judging_rubrics (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  track public.official_track not null,
  name text not null,
  -- [{ key, name, description, weight, max }]; weights must be approved before scores count.
  criteria jsonb not null,
  status public.confirmation not null default 'sample',
  updated_at timestamptz not null default now(),
  unique (event_id, track)
);

create table public.judge_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  judge_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'submitted', 'conflict', 'clarification')),
  conflict_note text,
  unique (judge_id, submission_id)
);

create table public.judging_scores (
  assignment_id uuid primary key references public.judge_assignments (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  comments text not null default '',
  final boolean not null default false,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  track public.official_track not null,
  submission_id uuid not null references public.submissions (id),
  place int not null check (place between 1 and 10),
  title text not null default '',
  published_at timestamptz,
  published_by uuid references auth.users (id),
  unique (event_id, track, place)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid references public.events (id) on delete set null,
  actor_id uuid references auth.users (id),
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.worker_heartbeats (
  worker_id text primary key,
  kind text not null,
  version text not null default '',
  last_seen timestamptz not null default now(),
  info jsonb not null default '{}'::jsonb
);

-- ───────────────────────────── permission helpers ─────────────────────────────

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.has_event_role(p_event uuid, p_roles public.event_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.event_roles where event_id = p_event and user_id = auth.uid() and role = any (p_roles));
$$;

create or replace function public.is_organiser(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_event_role(p_event, array['organiser']::public.event_role[]);
$$;

create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid());
$$;

create or replace function public.owns_participant(p_participant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_participants tp
    where tp.id = p_participant
      and (tp.user_id = auth.uid() or (tp.team_id is not null and public.is_team_member(tp.team_id)))
  );
$$;

create or replace function public.write_audit(p_event uuid, p_action text, p_type text, p_target text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (event_id, actor_id, action, target_type, target_id, details)
  values (p_event, auth.uid(), p_action, p_type, p_target, coalesce(p_details, '{}'::jsonb));
$$;

-- New accounts get a profile, and any matching approved registration is linked.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  update public.registrations set user_id = new.id where email = lower(new.email) and user_id is null;
  insert into public.event_roles (event_id, user_id, role)
    select r.event_id, new.id, 'participant' from public.registrations r
    where r.email = lower(new.email) and r.ticket = 'hackathon' and r.status in ('approved', 'checked_in')
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── row level security ─────────────────────────────

alter table public.events enable row level security;
alter table public.event_tracks enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.event_roles enable row level security;
alter table public.registrations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.projects enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_versions enable row level security;
alter table public.layer_runs enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.verification_attempts enable row level security;
alter table public.verification_jobs enable row level security;
alter table public.verification_receipts enable row level security;
alter table public.challenge_sessions enable row level security;
alter table public.tool_invocations enable row level security;
alter table public.advancement_decisions enable row level security;
alter table public.achievements enable row level security;
alter table public.activity_events enable row level security;
alter table public.announcements enable row level security;
alter table public.mentor_requests enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_artifacts enable row level security;
alter table public.judging_rubrics enable row level security;
alter table public.judge_assignments enable row level security;
alter table public.judging_scores enable row level security;
alter table public.winners enable row level security;
alter table public.audit_logs enable row level security;
alter table public.worker_heartbeats enable row level security;

-- Public event information (published events), readable by anyone including the venue screen.
create policy events_read on public.events for select using (status <> 'draft' or public.is_organiser(id));
create policy events_admin on public.events for all using (public.is_platform_admin() or public.is_organiser(id)) with check (public.is_platform_admin() or public.is_organiser(id));
create policy tracks_read on public.event_tracks for select using (true);
create policy tracks_admin on public.event_tracks for all using (public.is_organiser(event_id)) with check (public.is_organiser(event_id));

create policy profiles_self on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Teammates, mentors, judges and organisers of a shared event can see names.
create policy profiles_shared_event on public.profiles for select using (
  exists (
    select 1 from public.team_members a join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
  or exists (
    select 1 from public.event_roles me join public.event_roles them on me.event_id = them.event_id
    where me.user_id = auth.uid() and me.role in ('organiser', 'mentor', 'judge') and them.user_id = profiles.id
  )
  or public.is_platform_admin()
);

create policy admins_read on public.platform_admins for select using (user_id = auth.uid() or public.is_platform_admin());
create policy roles_read on public.event_roles for select using (user_id = auth.uid() or public.is_organiser(event_id));
create policy roles_admin on public.event_roles for all using (public.is_organiser(event_id)) with check (public.is_organiser(event_id));

create policy registrations_read on public.registrations for select using (user_id = auth.uid() or public.is_organiser(event_id));
create policy registrations_admin on public.registrations for all using (public.is_organiser(event_id)) with check (public.is_organiser(event_id));

-- Team names are public within the event (leaderboards); membership details are private.
create policy teams_read on public.teams for select using (true);
create policy team_members_read on public.team_members for select using (
  public.is_team_member(team_id) or public.has_event_role(event_id, array['organiser', 'mentor', 'judge']::public.event_role[])
);
create policy invites_read on public.team_invites for select using (public.is_team_member(team_id) or public.is_organiser(event_id));

create policy projects_read on public.projects for select using (public.is_team_member(team_id) or public.has_event_role(event_id, array['organiser', 'mentor', 'judge']::public.event_role[]));

-- Tournaments (except drafts and rehearsals) and their runtime state are spectator-safe.
create policy tournaments_read on public.tournaments for select using (
  (status <> 'draft' and not simulation and archived_at is null) or public.is_organiser(event_id)
);
create policy versions_read on public.tournament_versions for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and ((t.status <> 'draft' and not t.simulation) or public.is_organiser(t.event_id)))
);
create policy layer_runs_read on public.layer_runs for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and ((t.status <> 'draft' and not t.simulation) or public.is_organiser(t.event_id)))
);
create policy participants_read on public.tournament_participants for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and ((t.status <> 'draft' and not t.simulation) or public.is_organiser(t.event_id)))
);
create policy decisions_read on public.advancement_decisions for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and ((t.status <> 'draft' and not t.simulation) or public.is_organiser(t.event_id)))
);
create policy achievements_read on public.achievements for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and ((t.status <> 'draft' and not t.simulation) or public.is_organiser(t.event_id)))
);

-- Attempts: a team sees its own (feedback only; evidence is stripped by the view below).
create policy attempts_read on public.verification_attempts for select using (
  public.owns_participant(participant_id)
  or exists (select 1 from public.tournaments t where t.id = tournament_id and public.is_organiser(t.event_id))
);
create policy receipts_read on public.verification_receipts for select using (
  public.owns_participant(participant_id)
  or exists (select 1 from public.tournaments t where t.id = tournament_id and public.is_organiser(t.event_id))
);
-- Jobs, challenge sessions and tool invocations: organisers only (they contain hidden test data).
create policy jobs_read on public.verification_jobs for select using (
  exists (select 1 from public.verification_attempts a join public.tournaments t on t.id = a.tournament_id where a.id = attempt_id and public.is_organiser(t.event_id))
);
create policy sessions_read on public.challenge_sessions for select using (
  exists (select 1 from public.verification_attempts a join public.tournaments t on t.id = a.tournament_id where a.id = attempt_id and public.is_organiser(t.event_id))
);
create policy invocations_read on public.tool_invocations for select using (
  exists (
    select 1 from public.challenge_sessions s join public.verification_attempts a on a.id = s.attempt_id
    join public.tournaments t on t.id = a.tournament_id
    where s.id = session_id and public.is_organiser(t.event_id)
  )
);

create policy activity_read on public.activity_events for select using (is_public or public.is_organiser(event_id));

create policy announcements_read on public.announcements for select using (
  (published_at is not null and published_at <= now() and (
    audience = 'everyone'
    or (audience = 'participants' and public.has_event_role(event_id, array['participant', 'organiser']::public.event_role[]))
    or (audience = 'mentors' and public.has_event_role(event_id, array['mentor', 'organiser']::public.event_role[]))
    or (audience = 'judges' and public.has_event_role(event_id, array['judge', 'organiser']::public.event_role[]))
  ))
  or public.is_organiser(event_id)
);
create policy announcements_admin on public.announcements for all using (public.is_organiser(event_id)) with check (public.is_organiser(event_id));

create policy mentor_requests_read on public.mentor_requests for select using (
  requester_id = auth.uid()
  or (team_id is not null and public.is_team_member(team_id))
  or public.has_event_role(event_id, array['mentor', 'organiser']::public.event_role[])
);

create policy submissions_read on public.submissions for select using (
  public.is_team_member(team_id)
  or public.is_organiser(event_id)
  or exists (select 1 from public.judge_assignments j where j.submission_id = submissions.id and j.judge_id = auth.uid())
);
create policy artifacts_read on public.submission_artifacts for select using (
  exists (
    select 1 from public.submissions s where s.id = submission_id and (
      public.is_team_member(s.team_id) or public.is_organiser(s.event_id)
      or exists (select 1 from public.judge_assignments j where j.submission_id = s.id and j.judge_id = auth.uid())
    )
  )
);

create policy rubrics_read on public.judging_rubrics for select using (public.has_event_role(event_id, array['judge', 'organiser']::public.event_role[]) or status = 'confirmed');
create policy rubrics_admin on public.judging_rubrics for all using (public.is_organiser(event_id)) with check (public.is_organiser(event_id));
create policy assignments_read on public.judge_assignments for select using (judge_id = auth.uid() or public.is_organiser(event_id));
create policy scores_read on public.judging_scores for select using (
  exists (select 1 from public.judge_assignments j where j.id = assignment_id and (j.judge_id = auth.uid() or public.is_organiser(j.event_id)))
);
create policy winners_read on public.winners for select using (published_at is not null or public.is_organiser(event_id));

create policy audit_read on public.audit_logs for select using (public.is_platform_admin() or (event_id is not null and public.is_organiser(event_id)));
create policy heartbeats_read on public.worker_heartbeats for select using (
  public.is_platform_admin() or exists (select 1 from public.event_roles where user_id = auth.uid() and role = 'organiser')
);

-- Feedback-only view of attempts for participants: never exposes evidence (hidden test data).
create view public.my_attempts with (security_invoker = true) as
  select id, tournament_id, layer_run_id, participant_id, attempt_no, submitted_at, status, score, feedback, started_at, finished_at
  from public.verification_attempts;

-- Realtime: live feed and runtime state changes.
alter publication supabase_realtime add table public.activity_events, public.layer_runs, public.tournament_participants, public.tournaments;
