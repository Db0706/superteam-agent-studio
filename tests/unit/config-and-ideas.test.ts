import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FALLBACK_EVENT } from "@/config/active-event";
import { trackIdSchema } from "@/config/schema";
import { validateAllConfig } from "@/config/validate";
import { filterIdeas, IDEAS, NO_FILTERS, pickNext, type Idea } from "@/lib/inspiration/ideas";

describe("configuration", () => {
  it("passes schema validation", () => {
    expect(() => validateAllConfig()).not.toThrow();
  });
  it("labels every event fact and invents nothing unconfirmed", () => {
    const e = FALLBACK_EVENT;
    for (const f of [e.venue, e.organisers, e.supporters, e.agenda, e.prizes, e.teams, e.judging]) expect(["confirmed", "proposed", "sample", "tbc"]).toContain(f.status);
    expect(e.judging.status).toBe("tbc");
    expect(e.teams.status).toBe("tbc");
    expect(e.tracks.map((t) => t.track)).toEqual(["build", "policy"]);
  });
});

const ideaSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(3).max(80),
  industry: z.string().min(2),
  track: trackIdSchema,
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  type: z.enum(["Web app", "Mobile app", "Agent", "API service"]),
  problem: z.string().min(10),
  challenge: z.string().min(10),
  direction: z.string().min(10),
  angles: z.tuple([z.string().min(5), z.string().min(5)]),
});

describe("idea library", () => {
  it("has 250 valid, unique ideas", () => {
    expect(IDEAS).toHaveLength(250);
    IDEAS.forEach((i) => ideaSchema.parse(i));
    expect(new Set(IDEAS.map((i) => i.id)).size).toBe(250);
    expect(new Set(IDEAS.map((i) => i.title.toLowerCase())).size).toBe(250);
  });

  it("covers a wide range of industries and every track", () => {
    expect(new Set(IDEAS.map((i) => i.industry)).size).toBeGreaterThanOrEqual(20);
    for (const t of ["web", "mobile", "agents", "services"]) expect(IDEAS.filter((i) => i.track === t).length).toBeGreaterThan(40);
  });

  it("keeps the 24 design samples first", () => {
    expect(IDEAS[0].title).toBe("Pay-per-page newspaper archive");
    expect(IDEAS[23].title).toBe("Unlock one page of the repair manual");
  });

  it("filters combine", () => {
    const pool = filterIdeas({ ...NO_FILTERS, track: "Autonomous Agents", difficulty: "Advanced" });
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((i) => i.track === "agents" && i.difficulty === "Advanced")).toBe(true);
  });

  it("shuffle bag never repeats while unseen matches remain", () => {
    const pool = filterIdeas({ ...NO_FILTERS, industry: "Legal" });
    const seen = new Set<number>();
    let cur: number | null = null;
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < pool.length; i++) {
      const next: Idea = pickNext(pool, cur, seen, rng)!;
      expect(seen.has(next.id)).toBe(false);
      seen.add(next.id);
      cur = next.id;
    }
    // Bag exhausted: still returns something other than the current idea.
    const again = pickNext(pool, cur, seen, rng);
    expect(again).not.toBeNull();
    expect(again!.id).not.toBe(cur);
  });

  it("returns null for an empty pool or a single current idea", () => {
    expect(pickNext([], null, new Set())).toBeNull();
    expect(pickNext([IDEAS[0]], IDEAS[0].id, new Set())).toBeNull();
  });
});
