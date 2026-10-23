# Event-day operations: Oxford and Cambridge AI Race

Sunday 25 October 2026, King's College, Cambridge (Keynes Hall). Times are from the public programme, which says it may change. The race's start time, layers and rules are whatever organisers publish in the Builder; nothing here sets them.

## Days before

- [ ] Deployment done and checked ([DEPLOYMENT.md](DEPLOYMENT.md)), including custom SMTP and raised Auth rate limits.
- [ ] Approved list imported from the Luma CSV (**Admin → Participants**). Re-import whenever Luma changes: it adds and updates rows and never deletes registrations; anyone now marked declined loses participant access.
- [ ] Organiser, mentor and judge roles given (same page). Judges need the **judge** role before they can be assigned.
- [ ] Race built in **Admin → Tournaments** from the **Points race** template: set real points per layer, and your devnet receiving address on the *On-chain payment* stage (publishing is blocked until it's set). Rehearse at ×30 with fixture teams on production, then publish and schedule it for the start of the build sprint.
- [ ] Judging criteria for both tracks replaced and **confirmed** (**Admin → Judging**). Seeded criteria are samples; winners can't be published until criteria are confirmed.
- [ ] Submission windows checked on the landing page (Build and Policy, 11:30 to 18:30).
- [ ] Announcement drafted telling participants to sign in, form a team, deploy a starter with the race adapter and paste its URL on the team page.

## Morning (from 08:00)

- [ ] Two workers running; **Admin → Overview** shows a fresh heartbeat.
- [ ] `/display` open full screen on the venue machine.
- [ ] One organiser signed in on **Admin → Overview** and one on the race's **Control room** for the whole day.
- [ ] Desk check-in: search people on **Admin → Participants** and press *Check in*.

## 09:00 to 11:30: registration, talks, launch

- Participants sign in with the code emailed to them (the email address they registered with on Luma; accounts are matched by email).
- Teams form on `/team`: one person creates the team and shares the invite code. Each person can be in one team.
- At launch: show `/race` and the venue screen. Explain that the race is separate from track judging, and that leaving the race never affects track submissions.

## 11:30 to 18:30: build sprint and race

- Mentors work from `/mentor` (claim, resolve, escalate). Organisers watch queue health on **Admin → Mentors**.
- Every layer change appears on the venue screen. Use **Admin → Announcements** for anything everyone needs to know ("Everyone" also shows on the venue screen).
- Watch the control room for layers waiting on review or errors ([RUNBOOK.md](RUNBOOK.md)).
- The live leaderboard is at `/leaderboard` and on the venue screen (Cambridge vs Oxford by average points per team). On **Admin → Points & finalists** you can change a layer's points mid-race, award or revoke points for anything run off the platform (with a reason), and correct a team's university. Everything there is audited.
- Submissions: teams submit on `/submit` and get a receipt code. Organisers can reopen a submission with a reason on **Admin → Submissions**.

## 18:30 to 19:45: pitches, judging, awards

- On **Admin → Points & finalists**, choose how many teams go through to the pitches (once you know how many turned up) and confirm them. Finalists are marked on the leaderboard and the venue screen.
- Assign judges on **Admin → Judging** (*Assign evenly* with *Finalists only* ticked, or one by one). Judges score on `/judge`; they never see each other's scores and can declare a conflict.
- Results use final scores only, weighted by the confirmed criteria. A large disagreement between judges is flagged next to the result.
- Publish winners from the same page (with a confirmation step). They appear on the venue screen.

## Afterwards

- Export race results (**Control room → Export CSV**).
- Leave the platform up for a few days so teams can see their feedback, then archive the race.
