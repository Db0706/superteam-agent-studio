import { defineConfig } from "vitest/config";

// Integration tests run against a real local Supabase stack (npm run db:start, then db:reset).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
