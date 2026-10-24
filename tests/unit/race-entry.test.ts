import { describe, expect, it } from "vitest";
import { entryOpen } from "@/core/tournament/entry";

const layer = (state: string, outcome: "eliminate" | "checkpoint" = "eliminate") => ({ state, config: { outcome } }) as never;

describe("race entry", () => {
  it("is open before the start", () => {
    expect(entryOpen("published", { mode: "survival" }, [])).toBe(true);
    expect(entryOpen("scheduled", { mode: "survival" }, [])).toBe(true);
  });

  it("stays open all race in a points (checkpoint) race", () => {
    expect(entryOpen("running", { mode: "checkpoint" }, [layer("closed"), layer("open")])).toBe(true);
    expect(entryOpen("paused", { mode: "checkpoint" }, [layer("closed")])).toBe(true);
  });

  it("closes once an elimination round is being decided", () => {
    expect(entryOpen("running", { mode: "survival" }, [layer("open")])).toBe(true);
    expect(entryOpen("running", { mode: "survival" }, [layer("finalising"), layer("open")])).toBe(false);
    expect(entryOpen("running", { mode: "hybrid" }, [layer("closed", "checkpoint"), layer("open")])).toBe(true);
    expect(entryOpen("running", { mode: "hybrid" }, [layer("closed", "eliminate")])).toBe(false);
  });

  it("is closed once the race is over", () => {
    expect(entryOpen("completed", { mode: "checkpoint" }, [])).toBe(false);
    expect(entryOpen("cancelled", { mode: "checkpoint" }, [])).toBe(false);
  });
});
