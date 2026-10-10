"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { buildSteps, taskTotalCents, toCents, type SimConfig } from "@/lib/simulation/engine";
import { initialPlayback, playbackReducer, statusOf } from "@/lib/simulation/machine";
import { SCENARIOS, type ScenarioId } from "@/lib/simulation/scenarios";

export const STEP_MS = 1150;

export type Outcome = "normal" | "low" | "down";

/**
 * Wires the pure engine + playback reducer to React. Runs entirely in the
 * browser: one interval while running, no network.
 */
export function useSimulation() {
  const [config, setConfig] = useState<SimConfig>({ scenario: "research", budget: 1, serviceDown: false });
  const [playback, dispatch] = useReducer(playbackReducer, initialPlayback);

  const steps = useMemo(() => buildSteps(config), [config]);
  const total = steps.length;
  const status = statusOf(playback, steps);
  const current = playback.index >= 0 ? steps[playback.index] : null;
  const taskTotal = taskTotalCents(config.scenario);
  const outcome: Outcome = config.serviceDown ? "down" : toCents(config.budget) < taskTotal ? "low" : "normal";

  useEffect(() => {
    if (!playback.running) return;
    const t = setInterval(() => dispatch({ type: "tick", total }), STEP_MS);
    return () => clearInterval(t);
  }, [playback.running, total]);

  /** Any config change resets the simulation. */
  const configure = (patch: Partial<SimConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    dispatch({ type: "reset" });
  };

  return {
    config,
    scenario: SCENARIOS[config.scenario],
    steps,
    index: playback.index,
    running: playback.running,
    status,
    current,
    taskTotal,
    outcome,
    run: () => dispatch({ type: "run", total }),
    pause: () => dispatch({ type: "pause" }),
    step: () => dispatch({ type: "step", total }),
    reset: () => dispatch({ type: "reset" }),
    selectScenario: (scenario: ScenarioId) => configure({ scenario, budget: 1, serviceDown: false }),
    setBudget: (budget: number) => configure({ budget }),
    setOutcome: (o: Outcome) =>
      configure(o === "low" ? { budget: SCENARIOS[config.scenario].low, serviceDown: false } : { budget: 1, serviceDown: o === "down" }),
  };
}

export type Simulation = ReturnType<typeof useSimulation>;
