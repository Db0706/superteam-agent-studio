import Link from "next/link";
import { Suspense } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import { pointsRaceTemplate } from "@/core/tournament/templates";
import type { EventSummary } from "@/server/dal/viewer";
import { AutoRefresh } from "../AutoRefresh";

export const metadata = { title: "Readiness" };

export default function ReadinessPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/readiness" roles={["organiser"]}>
        {({ event }) => <Readiness event={event} />}
      </Gate>
    </Suspense>
  );
}

type State = "ok" | "warn" | "todo";
interface Item {
  label: string;
  state: State;
  detail: string;
  href?: string;
}

// Layers the fixture apps can't pass by design: they aren't real teams. (Payment is rehearsed only
// when the rehearsal includes it, with a funded fixture wallet.)
const NOT_REHEARSABLE = new Set(["platform.idea", "platform.submitted"]);
const SAMPLE_POINTS = new Map(pointsRaceTemplate({ sprintSeconds: 3600, challengeIntervalSeconds: 600 }).layers.map((l) => [l.key, l.points]));

interface LayerCfg {
  key: string;
  points?: number;
  verifier: { plugin: string; config: Record<string, unknown> };
}

async function Readiness({ event }: { event: EventSummary }) {
  const s = await createSupabaseServer();
  const e = event.id;
  const head = { count: "exact" as const, head: true };
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [hackathon, roles, heartbeats, races, rehearsals, nowRes] = await Promise.all([
    count(s.from("registrations").select("id", head).eq("event_id", e).eq("ticket", "hackathon")),
    s.from("event_roles").select("role").eq("event_id", e),
    s.from("worker_heartbeats").select("worker_id, last_seen").order("last_seen", { ascending: false }).limit(10),
    s.from("tournaments").select("id, name, status, current_version, draft_config, starts_at").eq("event_id", e).eq("simulation", false).is("archived_at", null).order("created_at", { ascending: false }),
    s.from("tournaments").select("id, name, status, current_version, completed_at").eq("event_id", e).eq("simulation", true).eq("status", "completed").order("completed_at", { ascending: false }).limit(1),
    s.rpc("server_now"),
  ]);
  const nowMs = Date.parse(String(nowRes.data));
  const items: Item[] = [];

  // Worker
  const live = (heartbeats.data ?? []).filter((h) => nowMs - Date.parse(h.last_seen) < 30_000).length;
  items.push({
    label: "Verification worker",
    state: live >= 2 ? "ok" : live === 1 ? "warn" : "todo",
    detail: live >= 2 ? `${live} instances running.` : live === 1 ? "One instance running. Set Replicas to 2 on Railway so a crash doesn't pause verification." : "No worker has reported in the last 30 seconds. Check Railway (or start the backup worker from the runbook).",
  });

  // Race
  const race = races.data?.[0];
  let layers: LayerCfg[] = [];
  if (race) {
    if (race.current_version) {
      const { data: v } = await s.from("tournament_versions").select("config").eq("tournament_id", race.id).eq("version", race.current_version).maybeSingle();
      layers = ((v?.config as { layers?: LayerCfg[] } | null)?.layers ?? []) as LayerCfg[];
    } else layers = ((race.draft_config as { layers?: LayerCfg[] } | null)?.layers ?? []) as LayerCfg[];
  }
  const ready = race && ["scheduled", "running", "paused", "finalising"].includes(race.status);
  items.push({
    label: "Race published and scheduled",
    state: !race ? "todo" : ready ? "ok" : race.status === "published" || race.status === "completed" ? "warn" : "todo",
    detail: !race
      ? "No race yet. Create one from the Points race template."
      : ready
        ? `${race.name}: ${race.status}${race.starts_at ? `, starts ${new Date(race.starts_at).toUTCString().slice(0, 22)} UTC` : ""}.`
        : race.status === "published"
          ? `${race.name} is published but not scheduled.`
          : race.status === "completed"
            ? `${race.name} has already finished. Duplicate it (or create a new race) for the event.`
          : `${race.name} is a ${race.status}. Validate, publish and schedule it.`,
    href: race ? `/admin/tournaments/${race.id}` : "/admin/tournaments",
  });
  if (race) {
    const pay = layers.find((l) => l.verifier.plugin === "payments.devnet_settlement");
    if (pay) {
      const raw = String(pay.verifier.config.payTo ?? "");
      const payTo = /^1+$/.test(raw) ? "" : raw;
      items.push({
        label: "On-chain payment address",
        state: payTo ? "ok" : "todo",
        detail: payTo ? `Payments go to ${payTo.slice(0, 4)}…${payTo.slice(-4)} on devnet.` : "Set your devnet receiving address on the On-chain payment stage. Publishing is blocked until it's set.",
        href: `/admin/tournaments/${race.id}`,
      });
    }
    const sample = layers.length > 0 && layers.every((l) => SAMPLE_POINTS.has(l.key) && SAMPLE_POINTS.get(l.key) === l.points);
    items.push({
      label: "Points per layer",
      state: sample ? "warn" : "ok",
      detail: sample ? "Every layer still has the template's sample points. Fine if you're happy with them; otherwise change them in the Builder (or mid-race in Points & finalists)." : "Points have been set for this race.",
      href: `/admin/tournaments/${race.id}`,
    });
  }

  // Rehearsal
  const reh = rehearsals.data?.[0];
  if (!reh) {
    items.push({ label: "Latest rehearsal", state: "todo", detail: "No completed rehearsal. Builder → Create rehearsal (×30), or scripts/rehearse.mts.", href: "/admin/tournaments" });
  } else {
    const [{ data: v }, { data: runs }, { data: ps }, { data: passed }, errors] = await Promise.all([
      s.from("tournament_versions").select("config").eq("tournament_id", reh.id).eq("version", reh.current_version ?? 1).maybeSingle(),
      s.from("layer_runs").select("id, layer_key").eq("tournament_id", reh.id),
      s.from("tournament_participants").select("id, display_name").eq("tournament_id", reh.id),
      s.from("verification_attempts").select("participant_id, layer_run_id").eq("tournament_id", reh.id).eq("status", "passed"),
      count(s.from("verification_attempts").select("id", head).eq("tournament_id", reh.id).eq("status", "error")),
    ]);
    const cfg = ((v?.config as { layers?: LayerCfg[] } | null)?.layers ?? []) as LayerCfg[];
    const rehearsable = new Set(cfg.filter((l) => !NOT_REHEARSABLE.has(l.verifier.plugin)).map((l) => l.key));
    const runKey = new Map((runs ?? []).map((r) => [r.id, r.layer_key]));
    const best = Math.max(0, ...(ps ?? []).map((p) => new Set((passed ?? []).filter((a) => a.participant_id === p.id).map((a) => runKey.get(a.layer_run_id)).filter((k) => k && rehearsable.has(k))).size));
    const ok = errors === 0 && best === rehearsable.size && rehearsable.size > 0;
    items.push({
      label: "Latest rehearsal",
      state: ok ? "ok" : "warn",
      detail: `${reh.name}, finished ${new Date(reh.completed_at!).toUTCString().slice(0, 22)} UTC: best fixture passed ${best} of ${rehearsable.size} layers it can pass, ${errors} verifier errors.${ok ? "" : " Open its control room to see what failed."}`,
      href: `/admin/tournaments/${reh.id}/control`,
    });
  }

  // People
  const r = (roles.data ?? []).map((x) => x.role as string);
  items.push({
    label: "Registrations imported",
    state: hackathon > 0 ? "ok" : "todo",
    detail: hackathon > 0 ? `${hackathon} hackathon registration${hackathon === 1 ? "" : "s"}.` : "Import the approved list from Luma (CSV export).",
    href: "/admin/participants",
  });
  for (const [role, label] of [["mentor", "Mentors"], ["judge", "Judges"]] as const) {
    const n = r.filter((x) => x === role).length;
    items.push({ label, state: n > 0 ? "ok" : "todo", detail: n > 0 ? `${n} assigned.` : `No ${label.toLowerCase()} yet. Give the role on Participants.`, href: "/admin/participants" });
  }

  const todo = items.filter((i) => i.state === "todo").length;
  const warn = items.filter((i) => i.state === "warn").length;

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} />
      <div className="flex flex-col gap-1">
        <h1 className="section-h">Readiness</h1>
        <p className="m-0 text-[14px] text-ink-2">
          {todo === 0 && warn === 0 ? "Everything the platform can check is ready." : `${todo} to do, ${warn} to look at.`} Checked live from the database; refreshes every 30 seconds.
        </p>
      </div>

      <Module label="CHECKED AUTOMATICALLY">
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
              <span className="pt-1.5">
                <Led color={i.state === "ok" ? COLORS.ok : i.state === "warn" ? COLORS.warnLed : COLORS.fault} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px] font-bold">{i.label}</span>
                  <span className="font-mono text-[10.5px]" style={{ color: i.state === "ok" ? COLORS.okText : i.state === "warn" ? COLORS.warnText : COLORS.fault }}>
                    {i.state === "ok" ? "READY" : i.state === "warn" ? "CHECK" : "TO DO"}
                  </span>
                </span>
                <span className="text-[13.5px] text-ink-2">{i.detail}</span>
              </div>
              {i.href && (
                <Link href={i.href} className="flex-none font-mono text-[11px]">
                  OPEN ▸
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Module>

      <Module label="CONFIRM YOURSELF">
        <ul className="m-0 flex list-none flex-col gap-2 p-4 text-[14px] text-ink-2">
          <li>
            <strong className="text-ink">Sign-in emails.</strong> Supabase&apos;s built-in email sends only a few codes an hour. Set up custom SMTP (Postmark) in Supabase → Authentication → Emails, then sign in with a fresh address to check a code arrives.
          </li>
          <li>
            <strong className="text-ink">Venue screen.</strong> Open <Link href="/display">/display</Link> full screen on the projector and check it reads from the back of the room.
          </li>
          <li>
            <strong className="text-ink">Wi-Fi and tunnels.</strong> Teams need a public https URL. Make sure the venue network allows Vercel deploys and ngrok.
          </li>
        </ul>
      </Module>
    </div>
  );
}
