import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPECTED_SCHEMA_VERSION } from "@/config/db-schema";

describe("EXPECTED_SCHEMA_VERSION", () => {
  it("matches the newest migration file", () => {
    const newest = readdirSync("supabase/migrations").filter((f) => /^\d+_.*\.sql$/.test(f)).sort().at(-1)!;
    expect(EXPECTED_SCHEMA_VERSION, "update src/config/db-schema.ts when you add a migration").toBe(newest.split("_")[0]);
  });
});
