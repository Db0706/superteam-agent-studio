"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { EXPLORER_URL, FAUCET_URL, GLOSSARY, GUIDE_MODULES, GUIDES, TROUBLESHOOTING, type GuideCommand, type GuideStep } from "@/config/guide";
import { FRAMEWORKS, FW_ORDER } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";
import { serializeBuilderParams } from "@/lib/project-builder/url-state";

const isFramework = (x: string | null): x is FrameworkId => !!x && (FW_ORDER as string[]).includes(x);

/** The Builder, pre-set to the guide's download for this framework. */
export function guideBuildHref(framework: FrameworkId) {
  return `/build?${serializeBuilderParams({ name: "my-first-paid-agent", framework, integrations: [...GUIDE_MODULES] })}`;
}

export function FirstTenMinutes() {
  const [fw, setFw] = useState<FrameworkId>("next");
  const guide = GUIDES[fw];

  // ?fw=python links straight to one framework's guide.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("fw");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of the URL after hydration
    if (isFramework(q)) setFw(q);
  }, []);

  const pick = (k: FrameworkId) => {
    setFw(k);
    const url = new URL(window.location.href);
    url.searchParams.set("fw", k);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(28px,4vw,48px)]">
      <div className="mb-2 flex max-w-[760px] flex-col gap-3.5">
        <span className="eyebrow">GUIDE · NO CRYPTO EXPERIENCE NEEDED</span>
        <h1 className="display-xl">Your first 10 minutes.</h1>
        <p className="m-0 max-w-[600px] text-[16px] leading-normal text-ink-2 [text-wrap:pretty]">
          From a downloaded ZIP to your first paid request on Solana devnet. You will make two test wallets, get free test money and watch your agent pay for data. Nothing here costs real money.
        </p>
      </div>

      <div role="group" aria-label="Framework" className="grid grid-cols-2 gap-2 min-[760px]:grid-cols-4">
        {FW_ORDER.map((k) => {
          const f = FRAMEWORKS[k];
          const sel = k === fw;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={sel}
              onClick={() => pick(k)}
              className="relative flex min-h-[84px] flex-col gap-1.5 rounded-[4px] border px-3 pb-3 pt-3 text-left text-ink hover:!bg-strip"
              style={{
                borderColor: sel ? COLORS.ink : "#CFCFC8",
                background: sel ? COLORS.strip : "#FFFFFF",
                boxShadow: sel ? "inset 0 0 0 1px #161616" : "0 2px 0 #CFCFC8",
                transform: sel ? "translateY(2px)" : "none",
                transition: "transform .08s ease, box-shadow .12s ease, background .12s ease",
              }}
            >
              <Led color={sel ? COLORS.signal : COLORS.cell} size={10} glow={sel ? "0 0 0 3px rgba(90,60,240,0.18)" : undefined} className="absolute right-2.5 top-2.5" />
              <span className="mt-auto text-[14px] font-bold leading-[1.2]">{f.name}</span>
              <span className="font-mono text-[10px] text-muted">{f.tech.toUpperCase()}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[1120px]:grid-cols-[minmax(0,1fr)_360px]">
        <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label={`Steps for ${FRAMEWORKS[fw].name}`}>
          {guide.steps.map((s, i) => (
            <li key={s.id}>
              <Step step={s} n={i + 1} fw={fw} />
            </li>
          ))}
          <li>
            <Module label="DONE" right={<><Led color={COLORS.ok} /> YOU PAID FOR DATA</>}>
              <div className="flex flex-col gap-3 p-4 text-[14px] leading-normal text-ink-2">
                <p className="m-0">
                  That was a real payment on a real network, made by code you own. Now make it yours: change what the paid endpoint returns, set your own price, or let a visitor pay from their own wallet with the Wallet Connection module (Web Application, or Mobile Application on Android).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/inspiration" className="btn-secondary !h-11 !px-4 !text-[14px] hover:!no-underline">
                    Find an idea
                  </Link>
                  <Link href="/playground" className="btn-secondary !h-11 !px-4 !text-[14px] hover:!no-underline">
                    See the flow in the Playground
                  </Link>
                </div>
              </div>
            </Module>
          </li>
        </ol>

        <aside className="flex flex-col gap-4 min-[1120px]:sticky min-[1120px]:top-[72px]">
          <Module label="BEFORE YOU START">
            <ul className="m-0 flex list-none flex-col gap-2.5 p-4 text-[14px] leading-normal text-ink-2">
              <li className="flex gap-2.5">
                <Led color={COLORS.signal} className="mt-[7px]" />
                <span>{guide.needs}</span>
              </li>
              <li className="flex gap-2.5">
                <Led color={COLORS.signal} className="mt-[7px]" />
                <span>A terminal and a code editor. No wallet app, sign-up or card.</span>
              </li>
              {guide.where && (
                <li className="flex gap-2.5">
                  <Led color={COLORS.signal} className="mt-[7px]" />
                  <span>{guide.where}</span>
                </li>
              )}
            </ul>
          </Module>
          <Module label="WORDS YOU WILL SEE">
            <dl className="m-0 flex flex-col p-4">
              {GLOSSARY.map(([word, meaning]) => (
                <div key={word} className="border-b border-hairline py-2.5 first:pt-0 last:border-b-0 last:pb-0">
                  <dt className="text-[14px] font-bold">{word}</dt>
                  <dd className="m-0 mt-0.5 text-[13px] leading-[1.45] text-ink-2">{meaning}</dd>
                </div>
              ))}
            </dl>
          </Module>
          <div className="rounded-[3px] border px-3.5 py-3 text-[13px] leading-[1.45]" style={{ borderColor: COLORS.warnBorder, background: COLORS.warnTint, color: COLORS.warnText }}>
            <b>Test money only.</b> The starters refuse any network but devnet. The keys they make are throwaway: never paste in a wallet that holds real money, and never share AGENT_PRIVATE_KEY.
          </div>
          <Module label="IF SOMETHING GOES WRONG">
            <dl className="m-0 flex flex-col p-4">
              {TROUBLESHOOTING.map(([message, fix]) => (
                <div key={message} className="border-b border-hairline py-2.5 first:pt-0 last:border-b-0 last:pb-0">
                  <dt className="font-mono text-[11.5px] font-medium text-ink">{message}</dt>
                  <dd className="m-0 mt-1 text-[13px] leading-[1.45] text-ink-2">{fix}</dd>
                </div>
              ))}
            </dl>
          </Module>
        </aside>
      </div>
    </div>
  );
}

function Step({ step, n, fw }: { step: GuideStep; n: number; fw: FrameworkId }) {
  const num = String(n).padStart(2, "0");
  return (
    <Module label={`${num} · ${step.title.toUpperCase()}`} right={step.minutes} aria-label={`Step ${num}: ${step.title}`}>
      <div className="flex flex-col gap-3 p-4">
        <p className="m-0 max-w-[680px] text-[14.5px] leading-normal text-ink-2 [text-wrap:pretty]">{step.body}</p>
        {step.id === "download" && (
          <Link href={guideBuildHref(fw)} className="btn-primary self-start !h-12 !px-5 !text-[15px] hover:!no-underline">
            Open Build, ready to download ▸
          </Link>
        )}
        {step.id === "faucet" && (
          <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="btn-primary self-start !h-12 !px-5 !text-[15px] hover:!no-underline">
            Open faucet.circle.com ↗
          </a>
        )}
        {step.commands.length > 0 && <Commands commands={step.commands} />}
        <div className="flex items-start gap-2.5 rounded-[3px] border px-3 py-2.5 text-[13px] leading-[1.45]" style={{ borderColor: "#B5E4CF", background: COLORS.okTint, color: COLORS.okText }}>
          <Led color={COLORS.ok} className="mt-[5px]" />
          <span>
            <b>You should see:</b> {step.check}
            {step.id === "pay" && (
              <>
                {" "}
                <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer">
                  Solana Explorer (devnet) ↗
                </a>
              </>
            )}
          </span>
        </div>
      </div>
    </Module>
  );
}

function Commands({ commands }: { commands: GuideCommand[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands.map((c) => c.cmd).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <div className="overflow-hidden rounded-[4px] bg-ink">
      <pre className="m-0 overflow-x-auto px-3.5 py-3 font-mono text-[12px] leading-[1.75] text-[#D4D4CE]">
        {commands.map((c, i) => (
          <span key={c.cmd + i} className="block">
            <span className="text-[#7A7A73]"># {c.what}</span>
            {"\n"}
            <span className="text-code-add">$</span> {c.cmd}
          </span>
        ))}
      </pre>
      <div className="flex justify-end border-t border-inv-div px-3.5 py-2">
        <button type="button" onClick={copy} className="h-9 rounded-[3px] border-0 bg-[#EDEDE8] px-3 font-mono text-[10.5px] font-semibold text-ink">
          {copied ? "COPIED ✓" : "COPY"}
        </button>
      </div>
    </div>
  );
}
