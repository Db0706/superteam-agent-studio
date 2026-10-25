-- Event facts re-read from https://luma.com/Oxbridge-AI-Race on 2026-10-25.
-- British Summer Time ends at 02:00 on 25 October 2026, so on the day London is GMT (UTC+0).
-- The original seed used +01, which put every time (including the submission deadline) an hour early.
-- Luma: 09:30 registration · 10:00–11:30 welcome · 11:30–18:30 build · 18:30–19:45 pitches · 19:45–21:30 dinner.
-- Prize: cash prizes of up to £1000 (not £2,000).

update public.events set
  starts_at = '2026-10-25 09:30:00+00',
  ends_at = '2026-10-25 21:30:00+00',
  details = details
    || jsonb_build_object('source', jsonb_build_object('url', 'https://luma.com/Oxbridge-AI-Race', 'readAt', '2026-10-25'))
    || jsonb_build_object('agenda', jsonb_build_object('status', 'confirmed', 'note', 'Programme subject to change.', 'value', jsonb_build_array(
      jsonb_build_object('start', '09:30', 'end', null, 'title', 'Registration, breakfast and coffee'),
      jsonb_build_object('start', '10:00', 'end', '11:30', 'title', 'Welcome, keynote, panels and competition launch'),
      jsonb_build_object('start', '11:30', 'end', '18:30', 'title', 'Build sprint, mentoring and lunch'),
      jsonb_build_object('start', '18:30', 'end', '19:45', 'title', 'Pitches, demos, judging and awards'),
      jsonb_build_object('start', '19:45', 'end', '21:30', 'title', 'Dinner, drinks and networking'))))
    || jsonb_build_object('prizes', jsonb_build_object('status', 'confirmed', 'note', 'Prize details will be shared before the event.', 'value', jsonb_build_array(
      'Cash prizes of up to £1000 across winning teams',
      'Fast-track access to the Solana Scholars Programme',
      'Tickets to the Solana Breakpoint Conference'))),
  updated_at = now()
where slug = 'oxbridge-ai-race-2026';

update public.event_tracks t set
  submissions_open_at = '2026-10-25 11:30:00+00',
  submissions_close_at = '2026-10-25 18:30:00+00'
from public.events e
where e.id = t.event_id and e.slug = 'oxbridge-ai-race-2026';
