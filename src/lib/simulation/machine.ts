import type { Step } from "./engine";

/**
 * Playback state machine for the Playground.
 *
 *   idle ──RUN──▶ running ──PAUSE──▶ paused ──RUN──▶ running
 *     │             │ TICK…                ▲
 *     └──STEP──────────────────────────────┘
 *   running/paused ──(last step)──▶ completed | failed
 *   any ──RESET / CONFIGURE──▶ idle
 *
 * "failed" means the run finished but the task could not be fully completed
 * (a budget decline or a service outage left a gap).
 */

export type SimStatus = "idle" | "running" | "paused" | "completed" | "failed";

export interface PlaybackState {
  /** Index of the latest revealed step; -1 = nothing revealed yet. */
  index: number;
  running: boolean;
}

export type PlaybackAction =
  | { type: "run"; total: number }
  | { type: "pause" }
  | { type: "step"; total: number }
  | { type: "tick"; total: number }
  | { type: "reset" };

export const initialPlayback: PlaybackState = { index: -1, running: false };

export function playbackReducer(s: PlaybackState, a: PlaybackAction): PlaybackState {
  switch (a.type) {
    case "run": {
      const finished = s.index >= a.total - 1;
      if (finished || s.index < 0) return { index: 0, running: a.total > 1 };
      return { ...s, running: true };
    }
    case "pause":
      return { ...s, running: false };
    case "step":
      return { running: false, index: Math.min(s.index + 1, a.total - 1) };
    case "tick": {
      if (!s.running) return s;
      const next = s.index + 1;
      if (next >= a.total) return { ...s, running: false };
      return { index: next, running: next < a.total - 1 };
    }
    case "reset":
      return initialPlayback;
  }
}

export function statusOf(s: PlaybackState, steps: Step[]): SimStatus {
  if (s.index < 0) return "idle";
  if (s.index >= steps.length - 1) return (steps[steps.length - 1]?.gaps ?? 0) > 0 ? "failed" : "completed";
  return s.running ? "running" : "paused";
}
