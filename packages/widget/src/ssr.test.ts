// @vitest-environment node
import { expect, test } from "vitest";

// The real-world failure: SSR frameworks (Next.js, SvelteKit) import modules on
// the server, where HTMLElement does not exist. A top-level import must not
// crash there -- integrators should not need a dynamic-import guard just to
// avoid a server exception.
test("ssr: a top-level import works where HTMLElement does not exist", async () => {
  expect(typeof HTMLElement).toBe("undefined");
  const mod = await import("./feedback-widget");
  expect(typeof mod.FeedbackWidget).toBe("function");
});
