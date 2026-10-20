# How a race works

The mechanics the platform enforces. The **official rules, timings, layers and prizes for any event are what its organisers publish**: on the race page, in announcements and on the event page. This document doesn't set them.

## Joining

- Teams join a published race from the race page before it starts. Only people on the event's approved list can take part.
- Each team connects one app: its public `https://` URL and the verifier token from the team page (see [VERIFICATION_SDK.md](VERIFICATION_SDK.md)).

## Layers

- A race is a sequence of layers. Each opens at a set time and closes at a deadline shown on the race page and the venue screen, counting down from the server's clock.
- When a layer opens, its instructions and the criteria being checked appear on the race page.
- Teams press **Run verification**. The verifier calls the team's app with fresh test tasks, so answers can't be copied or prepared in advance.
- An attempt counts if it was **submitted before the deadline**, by the server's clock. Verification can finish after the deadline; that's fine.
- Teams can retry until the deadline, within the layer's attempt limit and cooldown. Feedback says what failed and why, without giving away the hidden test data.

## Outcomes (set per race)

| Mode | What happens at a layer's deadline |
| --- | --- |
| Survival | Teams without a passing attempt are out of the race. |
| Ranked | Only the top N (or top %) by score stay in, with the published tie-break order. |
| Checkpoint | Nobody is eliminated; each layer is recorded as passed or missed. |
| Hybrid | Each layer is either eliminating or a checkpoint, as configured. |

A team's decision for a layer is made once. Ties are broken in the published order (for example: higher score, then earlier pass, then fewer attempts).

## Fairness

- If the platform fails, nobody is eliminated for it: the layer waits for an organiser. Organisers can pause the race (all clocks stop, and every later window moves by the paused time), extend a layer, suspend eliminations, reprocess an attempt or reinstate a team. Every intervention is logged with a reason.
- A team's own app being down is the team's responsibility, the same for everyone.
- Subjective judgements are never made by AI alone.

## The race and the tracks

Leaving the race doesn't affect anything else: every team can still build, get mentoring and submit to the event's official tracks. Race results only count towards track judging if the organisers say so for that event.
