-- The Oxford and Cambridge AI Race (25 October 2026), from the public Luma page
-- (https://luma.com/Oxbridge-AI-Race, read 2026-10-20). Only facts stated there are marked
-- "confirmed". Judging criteria, judges, team size and the tournament are NOT confirmed and are
-- seeded as samples for organisers to edit. Re-run with: npm run db:seed

insert into public.events (slug, name, short_name, timezone, starts_at, ends_at, status, details, branding)
values (
  'oxbridge-ai-race-2026',
  'Oxford and Cambridge AI Race',
  'Oxbridge AI Race',
  'Europe/London',
  '2026-10-25 09:00:00+01',
  '2026-10-25 21:30:00+01',
  'published',
  jsonb_build_object(
    'source', jsonb_build_object('url', 'https://luma.com/Oxbridge-AI-Race', 'readAt', '2026-10-20'),
    'venue', jsonb_build_object('value', 'King''s College, Cambridge · Keynes Hall', 'address', 'King''s Parade, Cambridge CB2 1ST', 'status', 'confirmed'),
    'organisers', jsonb_build_object('value', jsonb_build_array('Kings Politics Cambridge', 'AI3', 'Solana Superteam UK', 'Oxbridge AIx'), 'status', 'confirmed'),
    'supporters', jsonb_build_object('value', jsonb_build_array('Cambridge Entrepreneurs Society', 'Oxford Entrepreneurs', 'OxVC', 'OXAI'), 'status', 'confirmed'),
    'audience', jsonb_build_object('value', 'Students, researchers and aspiring entrepreneurs from Oxford and Cambridge. Technical, non-technical and policy backgrounds are equally welcome. No prior AI or blockchain experience required.', 'status', 'confirmed'),
    'agenda', jsonb_build_object('status', 'confirmed', 'note', 'Programme subject to change.', 'value', jsonb_build_array(
      jsonb_build_object('start', '09:00', 'end', null, 'title', 'Registration, breakfast and coffee'),
      jsonb_build_object('start', '09:30', 'end', '11:30', 'title', 'Welcome, keynote, panels and competition launch'),
      jsonb_build_object('start', '11:30', 'end', '18:30', 'title', 'Build sprint, mentoring and lunch'),
      jsonb_build_object('start', '18:30', 'end', '19:45', 'title', 'Pitches, demos, judging and awards'),
      jsonb_build_object('start', '19:45', 'end', '21:30', 'title', 'Dinner, drinks and networking')
    )),
    'prizes', jsonb_build_object('status', 'confirmed', 'note', 'Prize details will be shared before the event.', 'value', jsonb_build_array(
      'Cash prizes of up to £2,000 across winning teams',
      'Fast-track access to the Solana Scholars Programme',
      'Tickets to the Solana Breakpoint Conference'
    )),
    'teams', jsonb_build_object('value', 'Apply with a team or individually. Team size not stated.', 'status', 'tbc'),
    'judging', jsonb_build_object('value', 'Criteria and judges to be announced.', 'status', 'tbc'),
    'travel', jsonb_build_object('value', 'Return transport between Oxford and Cambridge is provided for Oxford students.', 'status', 'confirmed'),
    'aiAssistance', jsonb_build_object('value', 'AI-assisted coding is encouraged. Existing research can be a starting point.', 'status', 'confirmed')
  ),
  jsonb_build_object('accent', '#5A3CF0', 'presentedBy', 'Superteam UK')
)
on conflict (slug) do update set details = excluded.details, name = excluded.name, short_name = excluded.short_name, updated_at = now();

insert into public.event_tracks (event_id, track, name, description, status, submissions_open_at, submissions_close_at)
select id, 'build', 'Build Track',
  'Build an AI application: accelerate scientific discovery, improve research workflows, address institutional challenges, or explore AI × Solana applications such as agent payments, identity, provenance and verification.',
  'confirmed', '2026-10-25 11:30:00+01', '2026-10-25 18:30:00+01'
from public.events where slug = 'oxbridge-ai-race-2026'
on conflict (event_id, track) do update set description = excluded.description, status = excluded.status;

insert into public.event_tracks (event_id, track, name, description, status, submissions_open_at, submissions_close_at)
select id, 'policy', 'Policy Track',
  'Develop practical governance proposals alongside the technologies being built.',
  'confirmed', '2026-10-25 11:30:00+01', '2026-10-25 18:30:00+01'
from public.events where slug = 'oxbridge-ai-race-2026'
on conflict (event_id, track) do update set description = excluded.description, status = excluded.status;

-- Sample rubrics: NOT the official judging criteria. Organisers must replace and mark them confirmed.
insert into public.judging_rubrics (event_id, track, name, criteria, status)
select id, 'build', 'Build Track rubric (sample)', '[
  {"key": "impact", "name": "Problem and impact", "description": "Is the problem real and important? Would the solution matter?", "weight": 30, "max": 10},
  {"key": "execution", "name": "Technical execution", "description": "Does it work? Is it well built?", "weight": 30, "max": 10},
  {"key": "ai", "name": "Use of AI", "description": "Is AI essential and used well?", "weight": 25, "max": 10},
  {"key": "demo", "name": "Demo and clarity", "description": "Is it explained clearly in the time?", "weight": 15, "max": 10}
]'::jsonb, 'sample'
from public.events where slug = 'oxbridge-ai-race-2026'
on conflict (event_id, track) do nothing;

insert into public.judging_rubrics (event_id, track, name, criteria, status)
select id, 'policy', 'Policy Track rubric (sample)', '[
  {"key": "problem", "name": "Problem definition", "description": "Is the governance problem clearly defined and evidenced?", "weight": 25, "max": 10},
  {"key": "proposal", "name": "Quality of proposal", "description": "Is the framework coherent, specific and well reasoned?", "weight": 30, "max": 10},
  {"key": "feasibility", "name": "Implementation", "description": "Could it be implemented? Are costs and actors considered?", "weight": 25, "max": 10},
  {"key": "risks", "name": "Risks and limitations", "description": "Are risks, trade-offs and limits addressed honestly?", "weight": 20, "max": 10}
]'::jsonb, 'sample'
from public.events where slug = 'oxbridge-ai-race-2026'
on conflict (event_id, track) do nothing;
