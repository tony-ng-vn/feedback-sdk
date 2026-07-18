import { defineConfig } from "vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

// Two library builds from one config: an ESM entry that only registers the
// element, and a self-mounting IIFE for a plain <script> tag. Bundle all deps
// (including @feedback-sdk/client) so each output is self-contained.
export default defineConfig({
  plugins: [
    // Emit .d.ts for the public entry so TypeScript consumers get types. Only
    // the shipped source is included (not the loader or tests). The widget owns
    // its public types, so these declarations are self-contained.
    dts({
      tsconfigPath: resolve(__dirname, "tsconfig.json"),
      include: ["src/index.ts", "src/feedback-widget.ts", "src/types.ts"],
    }),
  ],
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
