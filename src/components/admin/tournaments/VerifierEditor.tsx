"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { VERIFIERS, getVerifier, validateVerifierConfig } from "@/core/verification/catalogue";
import type { VerifierRef } from "@/core/tournament/config";
import { field, labelCls } from "./ListActions";

type JsonProp = { type?: string | string[]; enum?: unknown[]; minimum?: number; maximum?: number; default?: unknown; description?: string };

const human = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/Ms$/, " (ms)");

/**
 * Verifier picker and settings. Simple settings (numbers, switches, text, choices) get a form
 * generated from the plugin's own schema; anything structured (e.g. API test cases) is edited as
 * JSON with validation. "Advanced" shows the whole settings object as JSON.
 */
export function VerifierEditor({ value, onChange, readOnly }: { value: VerifierRef; onChange: (v: VerifierRef) => void; readOnly: boolean }) {
  const plugin = getVerifier(value.plugin);
  const props = useMemo(() => {
    if (!plugin) return {} as Record<string, JsonProp>;
    try {
      const schema = z.toJSONSchema(plugin.configSchema as z.ZodType, { io: "input", unrepresentable: "any" }) as { properties?: Record<string, JsonProp> };
      return schema.properties ?? {};
    } catch {
      return {} as Record<string, JsonProp>;
    }
  }, [plugin]);
  const [advanced, setAdvanced] = useState(false);
  const [jsonDraft, setJsonDraft] = useState<Record<string, string>>({});
  const config = (value.config ?? {}) as Record<string, unknown>;
  const check = validateVerifierConfig(value.plugin, config);
  const set = (key: string, v: unknown) => onChange({ ...value, config: { ...config, [key]: v } });

  return (
    <div className="flex flex-col gap-3">
      <label className={labelCls}>
        How this layer is verified
        <select
          disabled={readOnly}
          value={value.plugin}
          onChange={(e) => {
            const next = getVerifier(e.target.value);
            onChange({ ...value, plugin: e.target.value, config: (next?.defaultConfig ?? {}) as Record<string, unknown> });
          }}
          className={field}
        >
          {VERIFIERS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.id})
            </option>
          ))}
        </select>
      </label>
      {plugin && <p className="m-0 text-[13px] leading-[1.5] text-ink-2">{plugin.description}</p>}

      {!advanced && (
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          {Object.entries(props).map(([key, p]) => {
            const type = Array.isArray(p.type) ? p.type.find((t) => t !== "null") : p.type;
            const current = config[key] ?? p.default;
            if (p.enum) {
              return (
                <label key={key} className={labelCls}>
                  {human(key)}
                  <select disabled={readOnly} value={String(current ?? "")} onChange={(e) => set(key, e.target.value)} className={field}>
                    {p.enum.map((o) => (
                      <option key={String(o)} value={String(o)}>
                        {String(o)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (type === "boolean") {
              return (
                <label key={key} className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" disabled={readOnly} checked={!!current} onChange={(e) => set(key, e.target.checked)} />
                  {human(key)}
                </label>
              );
            }
            if (type === "number" || type === "integer") {
              return (
                <label key={key} className={labelCls}>
                  {human(key)}
                  <input type="number" disabled={readOnly} min={p.minimum} max={p.maximum} step={type === "integer" ? 1 : "any"} value={current === undefined ? "" : String(current)} onChange={(e) => set(key, e.target.value === "" ? undefined : Number(e.target.value))} className={field} />
                </label>
              );
            }
            if (type === "string") {
              return (
                <label key={key} className={`${labelCls} ${key === "rubric" ? "min-[700px]:col-span-2" : ""}`}>
                  {human(key)}
                  {key === "rubric" ? (
                    <textarea disabled={readOnly} rows={3} value={String(current ?? "")} onChange={(e) => set(key, e.target.value)} className="rounded-[3px] border border-[#CFCFC8] bg-white px-3 py-2 text-[14px] font-normal" />
                  ) : (
                    <input disabled={readOnly} value={String(current ?? "")} onChange={(e) => set(key, e.target.value)} className={field} />
                  )}
                </label>
              );
            }
            // Structured settings: JSON for this field only.
            const draft = jsonDraft[key] ?? JSON.stringify(current ?? null, null, 2);
            return (
              <label key={key} className={`${labelCls} min-[700px]:col-span-2`}>
                {human(key)} (JSON)
                <textarea
                  disabled={readOnly}
                  rows={8}
                  value={draft}
                  onChange={(e) => {
                    setJsonDraft((d) => ({ ...d, [key]: e.target.value }));
                    try {
                      set(key, JSON.parse(e.target.value));
                    } catch {
                      /* keep typing */
                    }
                  }}
                  className="rounded-[3px] border border-[#CFCFC8] bg-white px-3 py-2 font-mono text-[12px] font-normal"
                />
              </label>
            );
          })}
        </div>
      )}

      {advanced && (
        <label className={labelCls}>
          All settings (JSON)
          <textarea
            disabled={readOnly}
            rows={12}
            defaultValue={JSON.stringify(config, null, 2)}
            onChange={(e) => {
              try {
                onChange({ ...value, config: JSON.parse(e.target.value) as Record<string, unknown> });
              } catch {
                /* keep typing */
              }
            }}
            className="rounded-[3px] border border-[#CFCFC8] bg-white px-3 py-2 font-mono text-[12px] font-normal"
          />
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px]" style={{ color: check.ok ? "#0B7A51" : "#C2361F" }}>
          {check.ok ? "Settings are valid." : check.message}
        </span>
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="border-0 bg-transparent p-0 font-mono text-[11px] text-signal">
          {advanced ? "SIMPLE FORM" : "ADVANCED (JSON)"}
        </button>
      </div>
    </div>
  );
}
