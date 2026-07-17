import { defineConfig } from "vitest/config";

// edge-runtime gives Web APIs (crypto, fetch) that convex-test and the
// client rely on; convex-test must be inlined so it loads as ESM.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
