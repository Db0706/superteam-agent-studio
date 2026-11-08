"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FRAMEWORKS, INTEGRATION_MAP, dependentsOf, normalizeIntegrations, statusOf, type IntegrationId } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";
import type { CodeTab } from "@/lib/project-builder/code";
import { getGenerator, ScaffoldRequestError, validateConfiguration } from "@/lib/project-builder/generator";
import { deriveProject, validateName } from "@/lib/project-builder/project";
import { DEFAULT_BUILDER, hasBuilderParams, parseBuilderParams, serializeBuilderParams, type BuilderConfig } from "@/lib/project-builder/url-state";

const STORAGE_KEY = "agent-studio:builder";
export const HIGHLIGHT_MS = 2600;
const GEN_TICK_MS = 120;
export const GEN_CELLS = 12;

export type GenState = "idle" | "working" | "done" | "error";
/** The real ZIP download, which runs after the preview is shown. */
export type DownloadState = "idle" | "working" | "done" | "error";

function readStored(): BuilderConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseBuilderParams(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Project Builder state. Name, framework and capabilities are mirrored to the
 * URL (shareable) and localStorage (survives navigation). Everything else is
 * derived from them via `deriveProject`.
 */
export function useBuilder() {
  const [cfg, setCfg] = useState<BuilderConfig>(DEFAULT_BUILDER);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<CodeTab>("tree");
  const [last, setLast] = useState<IntegrationId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gen, setGen] = useState<GenState>("idle");
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [dl, setDl] = useState<DownloadState>("idle");
  const [dlError, setDlError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [saved, setSaved] = useState<{ filename: string; files: number; version: string } | null>(null);
  const dlRequest = useRef(0);
  const lastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Restore: URL beats storage beats default. `/build?fw=expo` (from a track card)
  // keeps the student's other choices but swaps the framework.
  useEffect(() => {
    const search = window.location.search;
    const stored = readStored() ?? DEFAULT_BUILDER;
    let next = hasBuilderParams(search) ? parseBuilderParams(search, stored) : stored;
    next = { ...next, integrations: normalizeIntegrations(next.integrations, next.framework) };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off restore after hydration
    setCfg(next);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const qs = serializeBuilderParams(cfg);
    try {
      localStorage.setItem(STORAGE_KEY, qs);
    } catch {}
    const url = new URL(window.location.href);
    const ours = new URLSearchParams(qs);
    ours.forEach((v, k) => url.searchParams.set(k, v));
    window.history.replaceState(window.history.state, "", url);
  }, [cfg, hydrated]);

  useEffect(() => () => clearTimeout(lastTimer.current), []);

  // Generation preview animation (12 cells × 120ms). No network, nothing written.
  useEffect(() => {
    if (gen !== "working") return;
    let s = 0;
    const t = setInterval(() => {
      s += 1;
      if (s > GEN_CELLS) {
        clearInterval(t);
        setGen("done");
      } else setGenStep(s);
    }, GEN_TICK_MS);
    return () => clearInterval(t);
  }, [gen]);

  const name = validateName(cfg.name);
  const id = name.error ? name.id || "untitled-project" : name.id;
  const project = useMemo(() => deriveProject({ id, framework: cfg.framework, integrations: cfg.integrations }), [id, cfg.framework, cfg.integrations]);
  const validation = useMemo(() => validateConfiguration({ name: cfg.name, framework: cfg.framework, integrations: cfg.integrations }), [cfg]);
  const generator = getGenerator();
  const zip = useMemo(() => generator.zipAvailability({ name: cfg.name, framework: cfg.framework, integrations: cfg.integrations }), [generator, cfg]);

  const resetDownload = useCallback(() => {
    dlRequest.current += 1; // ignore any download still in flight
    setDl("idle");
    setDlError(null);
    setSaved(null);
  }, []);

  /** Any configuration change returns the output module to idle. */
  const update = useCallback(
    (patch: Partial<BuilderConfig>) => {
      setCfg((c) => ({ ...c, ...patch }));
      setGen("idle");
      setGenError(null);
      resetDownload();
    },
    [resetDownload],
  );

  const setName = (v: string) => update({ name: v });

  const names = (ids: IntegrationId[]) => ids.map((d) => INTEGRATION_MAP[d].name).join(", ");

  const pickFramework = (fw: FrameworkId) => {
    const integrations = normalizeIntegrations(cfg.integrations, fw);
    const dropped = cfg.integrations.filter((i) => !integrations.includes(i));
    update({ framework: fw, integrations });
    setLast(null);
    setNotice(dropped.length ? `${names(dropped)} unplugged: not available for ${FRAMEWORKS[fw].tech}.` : null);
  };

  const toggle = (iid: IntegrationId) => {
    if (statusOf(iid, cfg.framework) === "na") return;
    const on = cfg.integrations.includes(iid);
    if (on) {
      // Switching off a requirement also switches off what depends on it.
      const dependents = dependentsOf(iid, cfg.integrations);
      update({ integrations: cfg.integrations.filter((x) => x !== iid && !dependents.includes(x)) });
      if (dependents.length) setNotice(`${names(dependents)} also switched off: ${dependents.length > 1 ? "they need" : "it needs"} ${INTEGRATION_MAP[iid].name}.`);
    } else {
      const integrations = normalizeIntegrations([...cfg.integrations, iid], cfg.framework);
      const added = integrations.filter((x) => x !== iid && !cfg.integrations.includes(x));
      update({ integrations });
      if (added.length) setNotice(`${names(added)} also switched on: ${INTEGRATION_MAP[iid].name} needs ${added.length > 1 ? "them" : "it"}.`);
    }
    clearTimeout(lastTimer.current);
    setLast(on ? null : iid);
    if (!on) lastTimer.current = setTimeout(() => setLast(null), HIGHLIGHT_MS);
  };

  const generate = async () => {
    if (name.error) return;
    const result = await generator.validateSelection({ name: cfg.name, framework: cfg.framework, integrations: cfg.integrations });
    if (!result.ok) {
      setGen("error");
      setGenError(result.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" "));
      return;
    }
    setGenStep(0);
    setGen("working");
  };

  /** Builds the real project and saves it as `<name>.zip`. */
  const download = async () => {
    if (!zip.ok || dl === "working" || name.error) return;
    const req = ++dlRequest.current;
    setDl("working");
    setDlError(null);
    try {
      const result = await generator.generateProject({ name: cfg.name, framework: cfg.framework, integrations: cfg.integrations });
      if (req !== dlRequest.current) return;
      const url = URL.createObjectURL(result.archive);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setSaved({ filename: result.filename, files: result.manifest.length, version: result.generatorVersion });
      setDl("done");
    } catch (err) {
      if (req !== dlRequest.current) return;
      setDl("error");
      setDlError({
        message: err instanceof Error ? err.message : "The download failed.",
        retryable: err instanceof ScaffoldRequestError ? err.retryable : false,
      });
    }
  };

  const reset = () => {
    resetDownload();
    setCfg(DEFAULT_BUILDER);
    setTab("tree");
    setLast(null);
    setNotice(null);
    setGen("idle");
    setGenError(null);
  };

  return {
    cfg,
    hydrated,
    name,
    id,
    project,
    validation,
    generator,
    tab,
    setTab,
    last,
    notice,
    clearNotice: () => setNotice(null),
    gen,
    genStep,
    genError,
    zip,
    dl,
    dlError,
    saved,
    download,
    setName,
    pickFramework,
    toggle,
    generate,
    backToEdit: () => {
      setGen("idle");
      resetDownload();
    },
    reset,
  };
}

export type Builder = ReturnType<typeof useBuilder>;
