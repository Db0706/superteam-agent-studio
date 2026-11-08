import type { CSSProperties, ReactNode } from "react";
import type { CompatStatus } from "@/config/integrations";
import type { Confirmation } from "@/config/schema";

/** Shared "Schematic" primitives. Server-safe (no hooks). */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const COLORS = {
  ink: "#161616",
  muted: "#6A6A64",
  soft: "#D9D9D2",
  cell: "#E2E2DC",
  strip: "#F5F5F1",
  signal: "#5A3CF0",
  signalInk: "#4528D6",
  signalTint: "#F0ECFF",
  ok: "#10A36D",
  okText: "#0B7A51",
  okTint: "#EAF7F0",
  fault: "#C2361F",
  faultTint: "#FDEDEA",
  warnLed: "#E0A100",
  warnTint: "#FFF6E2",
  warnText: "#8A5A00",
  warnBorder: "#EBD3A0",
} as const;

export const GLOW = {
  signal: "0 0 0 3px rgba(90,60,240,0.2)",
  fault: "0 0 0 3px rgba(194,54,31,0.2)",
} as const;

interface ModuleProps {
  label: ReactNode;
  right?: ReactNode;
  variant?: "default" | "diagram";
  className?: string;
  bodyClassName?: string;
  as?: "section" | "article" | "div";
  id?: string;
  style?: CSSProperties;
  children?: ReactNode;
  "aria-label"?: string;
}

/** The base container: ink border + labelled header strip. */
export function Module({ label, right, variant = "default", className, as: Tag = "section", children, id, style, ...rest }: ModuleProps) {
  return (
    <Tag id={id} style={style} aria-label={rest["aria-label"]} className={cx("module", variant === "diagram" && "!bg-diagram", className)}>
      <div className="module-strip">
        <span>{label}</span>
        {right !== undefined && <span className="flex items-center gap-[7px] text-muted">{right}</span>}
      </div>
      {children}
    </Tag>
  );
}

export function Led({ color, size = 8, glow, blink, className, style }: { color: string; size?: number; glow?: string; blink?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block flex-none rounded-[1px]", blink && "animate-sx-blink", className)}
      style={{ width: size, height: size, background: color, boxShadow: glow ?? "none", transition: "background .3s ease", ...style }}
    />
  );
}

const STATUS_TONE: Record<CompatStatus, string> = { ok: "tone-ok", server: "tone-server", unverified: "tone-unverified", na: "tone-na" };
export const STATUS_CODE: Record<CompatStatus, string> = { ok: "RDY", server: "+SRV", unverified: "UNV", na: "N/A" };
export const STATUS_TEXT: Record<CompatStatus, string> = {
  ok: COLORS.okText,
  server: COLORS.signalInk,
  unverified: COLORS.warnText,
  na: COLORS.muted,
};

export function StatusCode({ status, children, className, title }: { status: CompatStatus; children?: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("status-code", STATUS_TONE[status], className)}>
      {children ?? STATUS_CODE[status]}
    </span>
  );
}

const CONFIRMATION_TONE: Record<Confirmation, CompatStatus> = { CONFIRMED: "ok", PROPOSED: "server", SAMPLE: "unverified", TBC: "na" };

/** PROPOSED / SAMPLE / TBC honesty tag (reuses the status-code styles). */
export function ConfirmationTag({ status, className }: { status: Confirmation; className?: string }) {
  return (
    <StatusCode status={CONFIRMATION_TONE[status]} className={cx("!text-[9.5px] !px-[5px] !py-1", className)}>
      {status}
    </StatusCode>
  );
}

/** 20-cell meter. Full meter = $2.00, so 1 cell = $0.10. */
export function CellMeter({ availableCents, spentCents = 0, label }: { availableCents: number; spentCents?: number; label: string }) {
  const left = Math.round((Math.max(0, availableCents) / 200) * 20);
  const spent = Math.round((Math.max(0, spentCents) / 200) * 20);
  return (
    <div role="img" aria-label={label} className="grid h-[14px] grid-cols-[repeat(20,1fr)] gap-[3px]">
      {Array.from({ length: 20 }, (_, i) => (
        <span
          key={i}
          className="rounded-[1px]"
          style={{ background: i < left ? COLORS.ok : i < left + spent ? COLORS.signal : COLORS.cell, transition: "background .3s ease" }}
        />
      ))}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, aside, id }: { eyebrow: string; title: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={id} className="section-h">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

export function Arrow() {
  return <span className="font-mono text-[13px]" aria-hidden="true">▸</span>;
}
