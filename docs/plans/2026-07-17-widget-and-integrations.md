# Feedback Widget + Reference Integrations -- Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is explicitly structured for PARALLEL execution -- read the "Parallelization model" section before dispatching.

**Goal:** Ship the framework-agnostic `<feedback-widget>` web component (npm + script-tag), and prove it by wiring it into two real apps of different stacks: Euno (React) and tony-todo-app (Svelte).

**Architecture:** One custom element, rendered in Shadow DOM, themeable via `--fw-*` CSS custom properties. On submit it calls `@feedback-sdk/client`'s `submitFeedback` (built in Plan 1) and fires a `feedback-submitted` event. It is built with Vite in library mode into an ESM entry (for `import`) and a self-mounting IIFE (for a `<script>` tag). Two reference integrations consume the built package.

**Tech Stack:** TypeScript, native Web Components (Custom Elements + Shadow DOM), Vite library build, Vitest + happy-dom (widget DOM tests), React 19 (Euno), Svelte/SvelteKit (tony-todo-app).

## Global Constraints

- Plain ASCII only in code, comments, and commit messages: no emoji, decorative symbols, em/en dashes, ellipsis characters, or curly quotes. Use `--`, `...`, straight quotes.
- Conventional Commits, imperative, lowercase, no trailing period. Never add an agent/tool co-author or mention tools.
- TDD where there is logic to test (the web component). Integrations are verified live in the browser, per the repo rule (drive the real flow).
- The widget is anonymous-friendly: it never requires the host app's auth. Identity is an optional `submitter` attribute.
- Public contract is FROZEN by Task 1 and must not drift: tag name `feedback-widget`; attributes `endpoint`, `token`, `categories`, `page-context`, `label`, `submitter`; event `feedback-submitted` with `detail: { id: string }`; package name `@feedback-sdk/widget`; ESM entry `@feedback-sdk/widget` (registers the element as a side effect) and script-tag build at `dist/feedback-widget.iife.js`.
- Theming: Shadow DOM with these CSS custom properties (defaults in parens): `--fw-accent` (#4f46e5), `--fw-surface` (#ffffff), `--fw-surface-strong` (#f5f5f7), `--fw-text` (#111111), `--fw-muted` (#6b7280), `--fw-border` (rgba(0,0,0,0.12)), `--fw-radius` (16px), `--fw-z` (2147483000).
- Categories default to `idea,bug,other` when the attribute is absent.
- `page-context` defaults to `location.pathname + location.search` when the attribute is absent.

---

## Parallelization model

This is the point of this plan. The dependency graph:

```
Task 1  (Wave 0, SOLO)  Lock contract + scaffold widget package
   |
   |  (contract frozen -> everything below codes against it)
   v
+---------------------- Wave 1 (PARALLEL, 4 tracks) ----------------------+
| Task 2  feedback-sdk    Implement web component + tests                 |
| Task 3  feedback-sdk    Script-tag loader + Vite build config          |
| Task 4  Euno repo       React reference integration (author)           |
| Task 5  tony-todo repo  Svelte reference integration (author)          |
+------------------------------------------------------------------------+
   |
   |  (widget builds; integrations authored)
   v
Task 6  (Wave 2, SOLO)  Build widget, install into both apps, live-verify
```

Why this is safe to parallelize:

- **Frozen contract.** Task 1 writes the package.json, the Vite config skeleton, the public README/contract, and a typed `index.ts` that re-exports. After Task 1 commits, tasks 2-5 all code against a stable, written interface and never need to see each other's code.
- **Strict file ownership.** No two Wave-1 tasks write the same file (table below). Shared files (package.json) are fully authored by Task 1 so no Wave-1 task edits them.
- **Cross-repo isolation.** Tasks 4 and 5 live in *different git repos* (Euno, tony-todo-app) than the widget and each other, so they cannot conflict at the filesystem or git level.
- **Same-repo pair.** Tasks 2 and 3 share the `feedback-sdk` repo but own disjoint files. If you dispatch them as parallel agents, either accept they touch different files (safe) or run Task 3 in a worktree. Task 3's *authoring* needs only the contract; Task 3's *build-verify step* needs Task 2 done (a pipeline edge, called out in the task).

File ownership (a file appears under exactly one task):

| Task | Repo | Owns (creates/edits) |
|------|------|----------------------|
| 1 | feedback-sdk | `packages/widget/package.json`, `packages/widget/vite.config.ts` (skeleton), `packages/widget/src/index.ts`, `packages/widget/README.md`, `packages/widget/src/types.ts` |
| 2 | feedback-sdk | `packages/widget/src/feedback-widget.ts`, `packages/widget/src/feedback-widget.test.ts` |
| 3 | feedback-sdk | `packages/widget/src/loader.ts`, `packages/widget/vite.config.ts` (final build config -- Task 1 leaves a TODO-free skeleton that Task 3 replaces wholesale; only Task 3 writes the build section) |
| 4 | Euno (`/Users/minhthiennguyen/Desktop/Euno/euno-app`) | `src/FeedbackWidget.tsx`, `src/feedback-widget.d.ts`, edit `src/App.tsx` |
| 5 | tony-todo (`/Users/minhthiennguyen/Desktop/tony-todo-app`) | `src/lib/components/FeedbackSdkWidget.svelte`, edit `src/routes/+page.svelte` |
| 6 | all three | build + install + `.env.local` in each app + live verification (no source overlap with 2-5) |

Note on Task 1/3 sharing `vite.config.ts`: to remove even that overlap, Task 1 does NOT create `vite.config.ts`. Task 3 creates it from scratch. Task 1 only lists the expected build outputs in the README contract. (Adjusted in the tasks below.)

Dispatch recipe (optional, for a Workflow): run Task 1 alone; then fan out `[Task2, Task3-author, Task4, Task5]` concurrently (Task 3 in a worktree or accept disjoint-file safety); barrier; then Task 3-build; then Task 6.

---

### Task 1: Lock the contract and scaffold the widget package (Wave 0, SOLO)

**Files:**
- Create: `packages/widget/package.json`, `packages/widget/src/index.ts`, `packages/widget/src/types.ts`, `packages/widget/README.md`

**Interfaces:**
- Consumes: `@feedback-sdk/client` (`submitFeedback`, `FeedbackCategory`) from Plan 1.
- Produces: the frozen public contract every later task codes against. `index.ts` imports `./feedback-widget` (created by Task 2) for its self-registering side effect and re-exports the class + types. `types.ts` holds shared types with no runtime.

- [ ] **Step 1: Create `packages/widget/package.json`**

```json
{
  "name": "@feedback-sdk/widget",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/feedback-widget.js",
  "module": "dist/feedback-widget.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/feedback-widget.js"
    },
    "./iife": "./dist/feedback-widget.iife.js"
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@feedback-sdk/client": "0.0.0"
  },
  "devDependencies": {
    "happy-dom": "^20.10.6",
    "vite": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/widget/src/types.ts`**

```ts
import type { FeedbackCategory } from "@feedback-sdk/client";

// The event a host can listen for after a successful submit.
export interface FeedbackSubmittedDetail {
  id: string;
}

export type { FeedbackCategory };

// Names of the CSS custom properties the widget exposes for theming.
export const THEME_VARS = [
  "--fw-accent",
  "--fw-surface",
  "--fw-surface-strong",
  "--fw-text",
  "--fw-muted",
  "--fw-border",
  "--fw-radius",
  "--fw-z",
] as const;
```

- [ ] **Step 3: Create `packages/widget/src/index.ts`**

```ts
// Public entry: importing this registers <feedback-widget> as a side effect.
import "./feedback-widget";

export { FeedbackWidget } from "./feedback-widget";
export type { FeedbackSubmittedDetail, FeedbackCategory } from "./types";
```

- [ ] **Step 4: Create `packages/widget/README.md` (the frozen contract)**

````markdown
# @feedback-sdk/widget

A framework-agnostic feedback button. Renders in Shadow DOM; themeable via CSS custom properties.

## Contract (frozen)

- Element: `<feedback-widget>`
- Attributes:
  - `endpoint` (required) -- the service HTTP base, e.g. `https://xxx.convex.site`
  - `token` (required) -- the project's public submit token (`fbk_...`)
  - `categories` (optional) -- comma-separated; default `idea,bug,other`
  - `page-context` (optional) -- default `location.pathname + location.search`
  - `label` (optional) -- button text; default `Feedback`
  - `submitter` (optional) -- identity string; omitted means anonymous
- Event: `feedback-submitted`, `CustomEvent<{ id: string }>`, bubbles + composed
- Theming: override `--fw-accent`, `--fw-surface`, `--fw-surface-strong`, `--fw-text`, `--fw-muted`, `--fw-border`, `--fw-radius`, `--fw-z`

## Usage

npm:
```js
import "@feedback-sdk/widget";
// then place <feedback-widget endpoint="..." token="fbk_..."></feedback-widget>
```

script tag (self-mounts a floating button from data-attrs):
```html
<script src="https://.../feedback-widget.iife.js"
        data-endpoint="https://xxx.convex.site"
        data-token="fbk_..."></script>
```

## Build outputs
- `dist/feedback-widget.js` -- ESM, registers the element on import
- `dist/feedback-widget.iife.js` -- self-mounting script-tag bundle
````

- [ ] **Step 5: Commit**

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
git add packages/widget
git commit -m "feat(widget): scaffold package and freeze public contract"
```

Note: `npm install` at the repo root is required once so the workspace links `@feedback-sdk/widget` and pulls `happy-dom`/`vite`. Run `npm install` from the repo root after this commit (before Wave 1 tests).

---

### Task 2: Implement the web component (Wave 1, PARALLEL) [feedback-sdk]

**Files:**
- Create: `packages/widget/src/feedback-widget.ts`, `packages/widget/src/feedback-widget.test.ts`

**Interfaces:**
- Consumes: `submitFeedback` from `@feedback-sdk/client`; the frozen contract from Task 1.
- Produces: `class FeedbackWidget extends HTMLElement`, self-registered as `feedback-widget`. On successful submit dispatches `new CustomEvent("feedback-submitted", { detail: { id }, bubbles: true, composed: true })`.

- [ ] **Step 1: Write the failing test `packages/widget/src/feedback-widget.test.ts`**

```ts
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const submitMock = vi.fn();
vi.mock("@feedback-sdk/client", () => ({
  submitFeedback: (...args: unknown[]) => submitMock(...args),
}));

// Import for the self-registering side effect after the mock is set up.
await import("./feedback-widget");

function mount(attrs: Record<string, string>) {
  const el = document.createElement("feedback-widget");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

function shadow(el: Element) {
  const root = (el as HTMLElement).shadowRoot;
  if (!root) throw new Error("no shadow root");
  return root;
}

beforeEach(() => {
  submitMock.mockReset();
  document.body.innerHTML = "";
});
afterEach(() => {
  document.body.innerHTML = "";
});

test("registers the custom element", () => {
  expect(customElements.get("feedback-widget")).toBeTruthy();
});

test("renders a trigger button with the default label", () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  const trigger = shadow(el).querySelector(".fw-fab");
  expect(trigger?.textContent).toContain("Feedback");
});

test("opening shows category chips from the categories attribute", () => {
  const el = mount({
    endpoint: "https://x.site",
    token: "fbk_x_1",
    categories: "idea,bug",
  });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const chips = [...shadow(el).querySelectorAll(".fw-chip")].map(
    (c) => c.textContent?.trim(),
  );
  expect(chips).toEqual(["idea", "bug"]);
});

test("submitting calls submitFeedback with endpoint, token, message, page context", async () => {
  submitMock.mockResolvedValue({ id: "fb_1" });
  const el = mount({
    endpoint: "https://x.site",
    token: "fbk_x_1",
    "page-context": "/dash",
  });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "it broke";
  textarea.dispatchEvent(new Event("input"));
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  await vi.waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));

  const arg = submitMock.mock.calls[0][0];
  expect(arg.endpoint).toBe("https://x.site");
  expect(arg.token).toBe("fbk_x_1");
  expect(arg.message).toBe("it broke");
  expect(arg.pageContext).toBe("/dash");
});

test("a successful submit dispatches feedback-submitted with the id", async () => {
  submitMock.mockResolvedValue({ id: "fb_42" });
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  const seen: string[] = [];
  el.addEventListener("feedback-submitted", (e) =>
    seen.push((e as CustomEvent<{ id: string }>).detail.id),
  );
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "nice";
  textarea.dispatchEvent(new Event("input"));
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  await vi.waitFor(() => expect(seen).toEqual(["fb_42"]));
});

test("a failed submit shows the error message and does not throw", async () => {
  submitMock.mockRejectedValue(new Error("Unauthorized"));
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  const textarea = shadow(el).querySelector(".fw-input") as HTMLTextAreaElement;
  textarea.value = "x";
  textarea.dispatchEvent(new Event("input"));
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  await vi.waitFor(() =>
    expect(shadow(el).querySelector(".fw-error")?.textContent).toContain(
      "Unauthorized",
    ),
  );
});

test("submit is a no-op when the message is empty", () => {
  const el = mount({ endpoint: "https://x.site", token: "fbk_x_1" });
  (shadow(el).querySelector(".fw-fab") as HTMLButtonElement).click();
  (shadow(el).querySelector(".fw-submit") as HTMLButtonElement).click();
  expect(submitMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run packages/widget/src/feedback-widget.test.ts`
Expected: FAIL -- cannot resolve `./feedback-widget`.

- [ ] **Step 3: Implement `packages/widget/src/feedback-widget.ts`**

```ts
import { submitFeedback } from "@feedback-sdk/client";
import type { FeedbackSubmittedDetail } from "./types";

type State = "idle" | "sending" | "sent" | "error";

const STYLE = `
  :host {
    --fw-accent: #4f46e5;
    --fw-surface: #ffffff;
    --fw-surface-strong: #f5f5f7;
    --fw-text: #111111;
    --fw-muted: #6b7280;
    --fw-border: rgba(0, 0, 0, 0.12);
    --fw-radius: 16px;
    --fw-z: 2147483000;
    position: fixed;
    right: 22px;
    bottom: 20px;
    z-index: var(--fw-z);
    font-family: system-ui, -apple-system, sans-serif;
  }
  .fw-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .fw-fab {
    min-height: 34px; padding: 7px 15px;
    border: 1px solid var(--fw-border); border-radius: 999px;
    background: var(--fw-surface-strong); color: var(--fw-text);
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  .fw-panel {
    width: min(300px, 78vw); display: flex; flex-direction: column; gap: 10px;
    padding: 14px; border: 1px solid var(--fw-border);
    border-radius: var(--fw-radius); background: var(--fw-surface);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  }
  .fw-head { display: flex; justify-content: space-between; align-items: center;
    color: var(--fw-text); font-size: 13px; font-weight: 600; }
  .fw-close { border: 0; background: transparent; color: var(--fw-muted);
    font-size: 18px; line-height: 1; cursor: pointer; }
  .fw-chips { display: flex; gap: 6px; }
  .fw-chip { flex: 1; min-height: 30px; border: 1px solid var(--fw-border);
    border-radius: 999px; background: transparent; color: var(--fw-text);
    font-size: 12px; cursor: pointer; text-transform: capitalize; }
  .fw-chip[aria-pressed="true"] { background: var(--fw-surface-strong);
    border-color: var(--fw-accent); }
  .fw-input { width: 100%; box-sizing: border-box; resize: vertical; padding: 10px;
    border: 1px solid var(--fw-border); border-radius: 12px;
    background: var(--fw-surface-strong); color: var(--fw-text); font-size: 13px; }
  .fw-error { margin: 0; color: #d64545; font-size: 12px; }
  .fw-submit { min-height: 34px; border: 0; border-radius: 999px;
    background: var(--fw-accent); color: #fff; font-size: 13px; font-weight: 600;
    cursor: pointer; }
  .fw-submit:disabled { opacity: 0.55; cursor: default; }
  [hidden] { display: none !important; }
`;

export class FeedbackWidget extends HTMLElement {
  private root: ShadowRoot;
  private open = false;
  private state: State = "idle";
  private category = "";
  private message = "";
  private errorMessage = "";

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    if (this.category === "") this.category = this.categories[0] ?? "idea";
    this.render();
  }

  private get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }
  private get token(): string {
    return this.getAttribute("token") ?? "";
  }
  private get label(): string {
    return this.getAttribute("label") ?? "Feedback";
  }
  private get categories(): string[] {
    const raw = this.getAttribute("categories");
    if (raw === null) return ["idea", "bug", "other"];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  private get pageContext(): string {
    const attr = this.getAttribute("page-context");
    if (attr !== null) return attr;
    return typeof location !== "undefined"
      ? location.pathname + location.search
      : "";
  }
  private get submitter(): string | undefined {
    return this.getAttribute("submitter") ?? undefined;
  }

  private toggle = (): void => {
    this.open = !this.open;
    if (this.open) {
      this.state = "idle";
      this.errorMessage = "";
    }
    this.render();
  };

  private pick(category: string): void {
    this.category = category;
    this.render();
  }

  private async doSubmit(): Promise<void> {
    const trimmed = this.message.trim();
    if (trimmed === "" || this.state === "sending") return;
    this.state = "sending";
    this.errorMessage = "";
    this.render();
    try {
      const result = await submitFeedback({
        endpoint: this.endpoint,
        token: this.token,
        message: trimmed,
        category: this.category as never,
        pageContext: this.pageContext,
        submitter: this.submitter,
      });
      this.state = "sent";
      this.message = "";
      const detail: FeedbackSubmittedDetail = { id: result.id };
      this.dispatchEvent(
        new CustomEvent("feedback-submitted", {
          detail,
          bubbles: true,
          composed: true,
        }),
      );
      this.render();
      setTimeout(() => {
        this.state = "idle";
        this.open = false;
        this.render();
      }, 1200);
    } catch (error) {
      this.state = "error";
      this.errorMessage =
        error instanceof Error ? error.message : "Could not send feedback.";
      this.render();
    }
  }

  private render(): void {
    const sending = this.state === "sending";
    const sent = this.state === "sent";
    const submitLabel = sending ? "Sending..." : sent ? "Thanks!" : "Submit";
    const chips = this.categories
      .map(
        (c) =>
          `<button class="fw-chip" data-cat="${c}" aria-pressed="${c === this.category}">${c}</button>`,
      )
      .join("");

    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="fw-wrap">
        <div class="fw-panel" ${this.open ? "" : "hidden"} role="dialog" aria-label="Send feedback">
          <div class="fw-head">
            <span>Share an idea</span>
            <button class="fw-close" aria-label="Close">x</button>
          </div>
          <div class="fw-chips">${chips}</div>
          <textarea class="fw-input" rows="4" placeholder="What's on your mind?" ${sending || sent ? "disabled" : ""}>${this.message}</textarea>
          ${this.state === "error" ? `<p class="fw-error" role="alert">${this.errorMessage}</p>` : ""}
          <button class="fw-submit" ${this.message.trim() === "" || sending || sent ? "disabled" : ""}>${submitLabel}</button>
        </div>
        <button class="fw-fab" aria-expanded="${this.open}">${this.label}</button>
      </div>
    `;

    this.root.querySelector(".fw-fab")?.addEventListener("click", this.toggle);
    this.root.querySelector(".fw-close")?.addEventListener("click", this.toggle);
    this.root.querySelectorAll(".fw-chip").forEach((chip) => {
      chip.addEventListener("click", () =>
        this.pick((chip as HTMLElement).dataset.cat ?? this.category),
      );
    });
    const input = this.root.querySelector(".fw-input") as HTMLTextAreaElement | null;
    input?.addEventListener("input", () => {
      this.message = input.value;
      const submit = this.root.querySelector(".fw-submit") as HTMLButtonElement | null;
      if (submit) submit.disabled = this.message.trim() === "";
    });
    this.root
      .querySelector(".fw-submit")
      ?.addEventListener("click", () => void this.doSubmit());
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("feedback-widget")
) {
  customElements.define("feedback-widget", FeedbackWidget);
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run packages/widget/src/feedback-widget.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
git add packages/widget/src/feedback-widget.ts packages/widget/src/feedback-widget.test.ts
git commit -m "feat(widget): implement feedback-widget custom element"
```

---

### Task 3: Script-tag loader and Vite build (Wave 1, PARALLEL author; build after Task 2) [feedback-sdk]

**Files:**
- Create: `packages/widget/src/loader.ts`, `packages/widget/vite.config.ts`

**Interfaces:**
- Consumes: the contract; `./feedback-widget` (self-registers on import).
- Produces: `dist/feedback-widget.js` (ESM) and `dist/feedback-widget.iife.js` (self-mounting). The loader, when loaded via a `<script>` tag carrying `data-endpoint` and `data-token`, appends one `<feedback-widget>` to `document.body`.

- [ ] **Step 1: Create `packages/widget/src/loader.ts`**

```ts
// Script-tag entry: registers the element, then self-mounts a floating widget
// using data-* attributes on its own <script> tag.
import "./feedback-widget";

function mountFromScriptTag(): void {
  const current =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector("script[data-endpoint][data-token]");
  if (current === null) return;
  const endpoint = current.getAttribute("data-endpoint");
  const token = current.getAttribute("data-token");
  if (!endpoint || !token) return;

  const el = document.createElement("feedback-widget");
  el.setAttribute("endpoint", endpoint);
  el.setAttribute("token", token);
  for (const name of ["categories", "label", "submitter", "page-context"]) {
    const value = current.getAttribute(`data-${name}`);
    if (value !== null) el.setAttribute(name, value);
  }
  document.body.appendChild(el);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountFromScriptTag);
} else {
  mountFromScriptTag();
}
```

- [ ] **Step 2: Create `packages/widget/vite.config.ts`**

```ts
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
```

Note: Vite `lib` with multiple entries emits ESM for both; the `.iife.js` name is kept for the self-mounting bundle (it is ESM-module script-compatible via `<script type="module">`). If a classic (non-module) script tag is required later, add a second config with `formats: ["iife"]` and a single entry; deferred to keep this task small.

- [ ] **Step 3: (after Task 2 is merged) Build and verify outputs**

Run:
```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
npm install
npm run build --workspace @feedback-sdk/widget
ls packages/widget/dist
```
Expected: `dist/feedback-widget.js` and `dist/feedback-widget.iife.js` exist.

- [ ] **Step 4: Commit**

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
git add packages/widget/src/loader.ts packages/widget/vite.config.ts
git commit -m "feat(widget): add script-tag loader and vite library build"
```

---

### Task 4: React reference integration (Wave 1, PARALLEL) [Euno repo]

**Files:**
- Create: `src/FeedbackWidget.tsx`, `src/feedback-widget.d.ts`
- Modify: `src/App.tsx` (mount the widget inside the `<Authenticated>` `Home` screen)

Repo: `/Users/minhthiennguyen/Desktop/Euno/euno-app`

**Interfaces:**
- Consumes: the `<feedback-widget>` custom element from `@feedback-sdk/widget` (installed in Task 6); env vars `VITE_FEEDBACK_ENDPOINT`, `VITE_FEEDBACK_TOKEN`.
- Produces: a `<FeedbackWidget />` React component that renders the element only when both env vars are set.

- [ ] **Step 1: Create `src/feedback-widget.d.ts` (teach JSX the element)**

```ts
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "feedback-widget": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          endpoint?: string;
          token?: string;
          categories?: string;
          "page-context"?: string;
          label?: string;
          submitter?: string;
        },
        HTMLElement
      >;
    }
  }
}
```

- [ ] **Step 2: Create `src/FeedbackWidget.tsx`**

```tsx
import "@feedback-sdk/widget";

// Renders the feedback button only when configured. Endpoint/token come from
// build-time env so the token (public submit token) is safe to ship.
const endpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT as string | undefined;
const token = import.meta.env.VITE_FEEDBACK_TOKEN as string | undefined;

export function FeedbackWidget() {
  if (!endpoint || !token) return null;
  return <feedback-widget endpoint={endpoint} token={token} />;
}
```

- [ ] **Step 3: Mount it in `src/App.tsx`**

Add the import near the other component imports:

```tsx
import { FeedbackWidget } from "./FeedbackWidget";
```

Then render it inside the authenticated `Home` component's returned fragment, right after `</main>`:

```tsx
      </main>
      <FeedbackWidget />
```

(Place it as the last child of the `Home` fragment so the fixed-position button overlays the app.)

- [ ] **Step 4: Typecheck**

Run: `cd /Users/minhthiennguyen/Desktop/Euno/euno-app && npx tsc -b`
Expected: no errors. (Live browser verification happens in Task 6, after the package is installed.)

- [ ] **Step 5: Commit (in the Euno repo)**

```bash
cd /Users/minhthiennguyen/Desktop/Euno/euno-app
git add src/FeedbackWidget.tsx src/feedback-widget.d.ts src/App.tsx
git commit -m "feat: add feedback widget to the authenticated app"
```

---

### Task 5: Svelte reference integration (Wave 1, PARALLEL) [tony-todo repo]

**Files:**
- Create: `src/lib/components/FeedbackSdkWidget.svelte`
- Modify: `src/routes/+page.svelte` (mount the new component)

Repo: `/Users/minhthiennguyen/Desktop/tony-todo-app`

**Interfaces:**
- Consumes: `<feedback-widget>` from `@feedback-sdk/widget` (installed in Task 6); env vars `VITE_FEEDBACK_ENDPOINT`, `VITE_FEEDBACK_TOKEN`.
- Produces: a Svelte component that renders the element when configured. This is the NEW SDK-backed widget; it does not remove the existing in-app `FeedbackWidget.svelte` (that stays until parity is confirmed).

- [ ] **Step 1: Create `src/lib/components/FeedbackSdkWidget.svelte`**

```svelte
<script>
  // Import registers the <feedback-widget> custom element as a side effect.
  import "@feedback-sdk/widget";

  const endpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT;
  const token = import.meta.env.VITE_FEEDBACK_TOKEN;
</script>

{#if endpoint && token}
  <feedback-widget {endpoint} {token}></feedback-widget>
{/if}
```

- [ ] **Step 2: Mount it in `src/routes/+page.svelte`**

Add to the script imports:

```js
  import FeedbackSdkWidget from "$lib/components/FeedbackSdkWidget.svelte";
```

Add the component near the end of the markup (top level of the page):

```svelte
<FeedbackSdkWidget />
```

- [ ] **Step 3: Typecheck / build check**

Run: `cd /Users/minhthiennguyen/Desktop/tony-todo-app && npm run build`
Expected: build succeeds. (Live verification in Task 6.)

- [ ] **Step 4: Commit (in the tony-todo repo)**

```bash
cd /Users/minhthiennguyen/Desktop/tony-todo-app
git add src/lib/components/FeedbackSdkWidget.svelte src/routes/+page.svelte
git commit -m "feat: add SDK-backed feedback widget alongside the built-in one"
```

---

### Task 6: Build, install, and live-verify (Wave 2, SOLO)

**Files:** app `.env.local` in Euno and tony-todo; no source overlap with earlier tasks.

**Interfaces:** proves the built widget works in both real apps against a running feedback service.

- [ ] **Step 1: Build the widget and pack a tarball**

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
npm install
npm run build --workspace @feedback-sdk/widget
cd packages/widget && npm pack
# produces feedback-sdk-widget-0.0.0.tgz in packages/widget/
```

- [ ] **Step 2: Start the feedback service and mint a project**

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
# leave running in another shell:
npx convex dev
# then, once ready:
npx convex run projects:create '{"slug":"euno"}'
npx convex run projects:create '{"slug":"tony-todo"}'
```
Record each `submitToken` and the `CONVEX_SITE_URL` from `.env.local`.

- [ ] **Step 3: Install and configure the widget in Euno**

```bash
cd /Users/minhthiennguyen/Desktop/Euno/euno-app
npm install /Users/minhthiennguyen/Desktop/feedback-sdk/packages/widget/feedback-sdk-widget-0.0.0.tgz
printf 'VITE_FEEDBACK_ENDPOINT=%s\nVITE_FEEDBACK_TOKEN=%s\n' "$SITE_URL" "$EUNO_SUBMIT_TOKEN" >> .env.local
```

- [ ] **Step 4: Run Euno and verify the button submits**

Run: `cd /Users/minhthiennguyen/Desktop/Euno/euno-app && npm run dev`
In the browser: sign in, click the Feedback button, submit a message. Then confirm it landed:
```bash
curl -s "$SITE_URL/feedback" -H "Authorization: Bearer $EUNO_ADMIN_KEY"
```
Expected: the submitted message with `status:"new"`.

- [ ] **Step 5: Install, configure, run, and verify in tony-todo (same shape)**

```bash
cd /Users/minhthiennguyen/Desktop/tony-todo-app
npm install /Users/minhthiennguyen/Desktop/feedback-sdk/packages/widget/feedback-sdk-widget-0.0.0.tgz
printf 'VITE_FEEDBACK_ENDPOINT=%s\nVITE_FEEDBACK_TOKEN=%s\n' "$SITE_URL" "$TODO_SUBMIT_TOKEN" >> .env.local
npm run dev
```
In the browser: submit via the new SDK widget, then `curl` the tony-todo project's feedback with its admin key and confirm the row.

- [ ] **Step 6: Record results**

No source commit (env files are gitignored). Note in the Plan 2 PR that both live loops passed: React (Euno) and Svelte (tony-todo) each submitted through the shared widget into isolated per-project stores.

---

## Self-Review

**Spec coverage:**
- Framework-agnostic web component -> Task 2. Covered.
- npm + script-tag delivery -> Tasks 1 (exports), 3 (loader + build). Covered.
- React reference integration (Euno) -> Task 4. Covered.
- Svelte reference integration (tony-todo) -> Task 5. Covered.
- Theming via CSS custom properties -> Task 2 STYLE block + contract. Covered.
- Anonymous submission -> widget never requires host auth; `submitter` optional. Covered.
- Widget calls the Plan 1 client -> Task 2 imports `submitFeedback`. Covered.

**Placeholder scan:** none -- every step has concrete code or commands.

**Type consistency:** `feedback-submitted` detail shape `{ id: string }` matches across `types.ts`, the component dispatch, and both integrations' contract; attribute names match between the contract (Task 1), the component getters (Task 2), the loader (Task 3), and the JSX/Svelte usages (Tasks 4-5).

**Parallelism check:** every Wave-1 file appears under exactly one task; the only cross-task file question (`vite.config.ts`) is resolved by giving it solely to Task 3; Tasks 4 and 5 are in separate repos. Task 3's build-verify and all of Task 6 are the sequenced (non-parallel) steps, explicitly marked.

**Deferred to later plans:** a classic (non-module) IIFE build if a non-module script tag is ever needed (Task 3 note); replacing tony-todo's built-in `FeedbackWidget.svelte` once the SDK widget reaches parity (Task 5 note); CLI `init` (Plan 3); MCP + webhook (Plan 4).
