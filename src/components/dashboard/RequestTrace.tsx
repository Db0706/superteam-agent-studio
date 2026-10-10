"use client";

import { useEffect, useState } from "react";
import { CellMeter, COLORS, GLOW, Led } from "@/components/system";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

type Tone = "line" | "server" | "purple-fill" | "ok";
const ROWS: Array<[who: string, code: string, text: string, tone: Tone]> = [
  ["AGENT", "GET", "Requests /v1/company-profiles", "line"],
  ["SERVICE", "402", "Payment required · $0.05", "server"],
  ["AGENT", "CHK", "Within budget · $1.00 available", "line"],
  ["AGENT", "PAY", "Authorises $0.05 and retries", "purple-fill"],
  ["SERVICE", "200", "Profile delivered", "ok"],
];

/** Hero "request trace": loops 0→7 every 1.1s. Static (fully revealed) under reduced motion. */
export function RequestTrace() {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setStep((s) => (s + 1) % 8), 1100);
    return () => clearInterval(t);
  }, [reduced]);

  const hs = reduced ? 6 : step;
  const paid = hs >= 4;

  return (
    <div className="module" aria-label="Simulated request trace">
      <div className="module-strip">
        <span>TRACE · RESEARCH-ASSISTANT</span>
        <span className="rounded-[2px] border border-warn-border bg-warn-tint px-1.5 py-[3px] text-warn-text">SIMULATED</span>
      </div>
      <ol className="soft-dots m-0 flex list-none flex-col gap-0.5 p-2.5" style={{ backgroundImage: "radial-gradient(#E6E6E0 1px,transparent 1px)" }}>
        {ROWS.map(([who, code, text, tone], i) => {
          const cur = i === hs - 1;
          const seen = i < hs;
          return (
            <li
              key={code}
              className="grid grid-cols-[10px_62px_46px_minmax(0,1fr)] items-center gap-3 rounded-[3px] border px-2.5 py-[11px]"
              style={{
                borderColor: cur ? COLORS.signal : seen ? COLORS.cell : "transparent",
                background: cur ? COLORS.signalTint : seen ? "#FFFFFF" : "transparent",
                opacity: seen ? 1 : 0.32,
                transition: "opacity .35s ease, background .3s ease, border-color .3s ease",
              }}
            >
              <Led color={cur ? COLORS.signal : seen ? COLORS.ok : COLORS.soft} glow={cur ? GLOW.signal : undefined} />
              <span className="font-mono text-[10.5px] font-medium text-muted">{who}</span>
              <span className={`status-code tone-${tone} !py-[5px] !px-0 text-center`}>{code}</span>
              <span className="truncate text-[14px] font-semibold">{text}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-2.5 border-t border-ink p-3.5">
        <div className="flex items-baseline justify-between font-mono text-[10.5px] font-medium text-muted">
          <span>AVAILABLE FUNDS</span>
          <span className="wide font-sans text-[22px] tracking-[-0.02em] text-ink">{paid ? "$0.95" : "$1.00"}</span>
        </div>
        <CellMeter availableCents={paid ? 190 : 200} label={`Available funds ${paid ? "$0.95" : "$1.00"} (simulated)`} />
        <span className="text-[12.5px] leading-[1.45] text-muted">
          An AI agent asks for data, gets a price, checks its budget and pays, all in one web request. Payments settle on Solana.
        </span>
      </div>
    </div>
  );
}
