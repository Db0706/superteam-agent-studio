import type { Metadata } from "next";
import Link from "next/link";
import { Module } from "@/components/system";
import { AgentSimulation } from "@/components/playground/Playground";
import { INTEGRATION_MAP } from "@/config/integrations";
import { LAB_CAPABILITIES } from "@/config/lab";
import { LAYER_TEMPLATES } from "@/core/tournament/templates";
import { getVerifier } from "@/core/verification/catalogue";

export const metadata: Metadata = {
  title: "AI Capability Lab",
  description: "What each AI capability takes, which starters give you working code for it, and how the AI Race verifies it. Includes a simulated payment agent.",
};

type Label = "SIMULATED" | "REAL INTEGRATION" | "VERIFIED";
const TONE: Record<Label, string> = {
  SIMULATED: "border-warn-border bg-warn-tint text-warn-text",
  "REAL INTEGRATION": "border-ok-border bg-ok-tint text-ok-text",
  VERIFIED: "border-signal bg-signal-tint text-signal-ink",
};

export default function LabPage() {
  return (
    <div className="page-wrap flex flex-col gap-[clamp(40px,5vw,64px)] pb-20 pt-[clamp(28px,4vw,48px)]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-3.5">
          <span className="eyebrow">AI CAPABILITY LAB</span>
          <h1 className="display-l">
            What AI apps
            <br />
            are made of.
          </h1>
        </div>
        <div className="flex max-w-[460px] flex-col gap-2 text-[14px] leading-normal text-ink-2">
          <p className="m-0">Every capability below is labelled for what it really is here:</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {(Object.keys(TONE) as Label[]).map((l) => (
              <li key={l} className="flex items-baseline gap-2">
                <Tag label={l} />
                <span>{l === "SIMULATED" ? "a demo in your browser, no real AI or money" : l === "REAL INTEGRATION" ? "a starter module ships working code for it" : "an AI Race layer checks it against your live app"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section aria-labelledby="caps-h" className="flex flex-col gap-3">
        <h2 id="caps-h" className="sr-only">
          Capabilities
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,330px),1fr))] gap-3">
          {LAB_CAPABILITIES.map((c) => {
            const layer = LAYER_TEMPLATES.find((l) => l.verifier.plugin === c.verifier);
            const verifier = getVerifier(c.verifier);
            const modules = c.integrations.map((id) => INTEGRATION_MAP[id]);
            const real = modules.some((m) => m.verifiedOn.length > 0 && m.id !== "race");
            const labels: Label[] = [...(c.simulation ? (["SIMULATED"] as const) : []), ...(real ? (["REAL INTEGRATION"] as const) : []), ...(verifier ? (["VERIFIED"] as const) : [])];
            return (
              <Module key={c.id} label={c.name.toUpperCase()}>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((l) => (
                      <Tag key={l} label={l} />
                    ))}
                  </div>
                  <p className="m-0 text-[14px] leading-normal text-ink-2">{c.description}</p>
                  <dl className="m-0 flex flex-col gap-2 text-[13px]">
                    <div className="flex flex-col gap-0.5">
                      <dt className="mono-label">STARTER CODE</dt>
                      <dd className="m-0">
                        {modules.map((m) => m.name).join(" · ")}
                        {modules.every((m) => m.id === "race") && <span className="text-muted"> (you write the logic; the adapter connects it to the race)</span>}
                      </dd>
                    </div>
                    {verifier && (
                      <div className="flex flex-col gap-0.5">
                        <dt className="mono-label">HOW IT&apos;S VERIFIED</dt>
                        <dd className="m-0">
                          {layer ? <b>{layer.title}</b> : <b>Optional layer</b>}
                          <span className="text-ink-2">: {verifier.description}</span>
                          {!layer && <span className="text-muted"> Organisers can add it to a race.</span>}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href={`/build?caps=${c.integrations.join(",")}`} className="btn-secondary !h-9 !px-3 !text-[12px]">
                      GET THE STARTER
                    </Link>
                    {c.simulation && (
                      <a href={`#${c.simulation}`} className="btn-secondary !h-9 !px-3 !text-[12px]">
                        TRY THE SIMULATION
                      </a>
                    )}
                  </div>
                </div>
              </Module>
            );
          })}
        </div>
        <p className="m-0 text-[13px] text-muted">
          Ready to prove it? <Link href="/race">Open the AI Race</Link> and connect your app with the race adapter.
        </p>
      </section>

      <AgentSimulation />
    </div>
  );
}

function Tag({ label }: { label: Label }) {
  return <span className={`whitespace-nowrap rounded-[2px] border px-1.5 py-[3px] font-mono text-[9.5px] ${TONE[label]}`}>{label}</span>;
}
