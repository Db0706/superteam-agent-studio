# Recovery runbook

What to do when something breaks during a live race. Every control below is in **Admin → Tournaments → (race) → Control room** unless stated otherwise, needs a reason, and is written to the audit log.

**First move for anything that affects fairness: Pause.** Pausing freezes every clock. On resume, every remaining window moves by exactly the paused time, so nobody loses minutes. Then investigate.

## Quick reference

| Symptom | Likely cause | Do this |
| --- | --- | --- |
| Admin overview says **worker silent** | Worker process stopped | Pause. Restart the worker service (Railway → Restart). Leased jobs re-run when their lease expires (3 minutes). Resume once the heartbeat is fresh. |
| Attempts stuck in **QUEUED** | No worker running, or all slots busy | Check the heartbeat and queue depth on the overview. Start a second worker or raise `WORKER_CONCURRENCY`. |
| A layer sits in **FINALISING** | An on-time attempt has no result yet, or one ended in **ERROR** or **REVIEW** | The control room lists what is blocking. ERROR: *Reprocess* it (the worker runs it again). REVIEW: open the evidence and *Review* (pass/fail with a note). The layer closes on its own once nothing is blocking. |
| Many attempts end in **ERROR** | Platform-side failure (database, challenge services, our network) | Pause. Look at the error text in the attempt evidence. Fix the cause, then *Reprocess* each one. Errors never eliminate anyone by themselves: they block the layer. |
| A team says the verifier is wrong | Bug in a check, or the team misread the instructions | Open their attempt's evidence (hidden inputs, expected values, raw responses). If the check was wrong: *Override* the decision or *Reinstate* the team, with the reason. Don't change the layer's rules mid-race. |
| Most teams failing one layer for the same reason | Instructions unclear, or a check too strict | *Suspend eliminations* for the race (teams who miss it stay in), post an announcement, and *Extend* the layer if they need time. Lift the suspension afterwards. |
| A team's app is down | Their hosting | That's their responsibility, the same for everyone. They can fix it and retry before the deadline. Mentors can help. |
| Teams can't reach `/api/race/challenge/*` | Vercel deployment problem | Pause. Promote the previous Vercel deployment. Resume. |
| Venue Wi-Fi drops | Network | Pause if teams can't work. Participants' apps are on the internet, so verification itself doesn't depend on the venue network. |
| Supabase is down | Provider outage | Pause is unavailable while the database is down. Announce verbally. When it's back: Pause (the clock kept running), then *Extend* the current layer by the outage time with *shift following layers* on, then Resume. |
| Sign-in codes not arriving | SMTP or rate limits | Check the SMTP provider's dashboard and Supabase Auth logs. Raise Auth rate limits if they're being hit (venue = one IP). |
| Venue screen frozen | Browser or display machine | Reload `/display`. It reconnects and polls every 5 seconds even without Realtime. |
| Wrong layer timing published | Configuration mistake | Before scheduling: *Unpublish*, fix, publish again. After scheduling: rules are locked, so *Extend* (adds time to a layer, optionally shifting the rest) is the only timing change. |
| The race has to stop | Anything serious | *Cancel* ends it for everyone with the reason shown. The event's official tracks and judging are unaffected. |

## Principles

- **The database clock decides.** An attempt counts if its `submitted_at` (set by Postgres) is before the deadline, however long verification takes afterwards. Nobody is eliminated by a slow verifier.
- **Infrastructure problems never decide outcomes.** They block a layer until a person resolves them.
- **AI judgement is never the only authority for subjective decisions.** Human-review layers and appeals go to an organiser with the evidence.
- **The race doesn't affect track eligibility.** Every team can submit to the Build and Policy tracks however far they got in the race. Say so when people are eliminated.
- **Every intervention is audited** (Admin → Audit log) with who, when and why. Write reasons a participant could read.

## After the event

- Export results: **Control room → Export CSV** (attempts, scores, decisions, timings).
- Audit log: **Admin → Audit log**.
- Rotate `RECEIPT_SIGNING_KEY` only if you no longer need old receipts to verify.
