import { defineConfig } from "vite";
import { resolve } from "node:path";

// Two library builds from one config: an ESM entry that only registers the
// element, and a self-mounting IIFE for a plain <script> tag. Bundle all deps
// (including @feedback-sdk/client) so each output is self-contained.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: {
        "feedback-widget": resolve(__dirname, "src/index.ts"),
        "feedback-widget.iife": resolve(__dirname, "src/loader.ts"),
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      output: { inlineDynamicImports: false },
    },
  },
});
