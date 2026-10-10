import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // POST /api/scaffold reads the vendored scaffold templates at runtime.
  outputFileTracingIncludes: {
    "/api/scaffold": ["./vendor/agent-studio-scaffolds/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
