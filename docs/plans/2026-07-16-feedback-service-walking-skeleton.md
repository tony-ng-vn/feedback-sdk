# Feedback Service Walking Skeleton -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Convex feedback service and a tiny client, proven end to end: mint a project, submit feedback with its public token, read it back with its admin key, and prove one project cannot read another's.

**Architecture:** A standalone Convex backend stores `projects` and `feedback`, isolated per project. Browser-facing writes and agent-facing reads go through HTTP endpoints (`httpAction`) guarded by two hashed per-project keys. A small `client` package wraps the submit POST. This is Plan 1 of 4 (service+client, then widget, then CLI, then MCP/webhook).

**Tech Stack:** Convex (schema + functions + HTTP actions), TypeScript, Vitest + convex-test, npm workspaces. Web Crypto for hashing/secrets (built into the Convex runtime and @edge-runtime/vm).

## Global Constraints

- Output is plain ASCII only: no emoji, decorative symbols, em/en dashes, ellipsis characters, or curly quotes, in code, comments, or commit messages. Use `--`, `...`, straight quotes.
- Commits follow Conventional Commits (`type(scope): description`), imperative, lowercase, no trailing period. Never add an agent/tool co-author or mention tools in commit messages.
- TDD: write the failing test, watch it fail for the right reason, implement minimally, watch it pass, commit.
- Two credentials per project: a public submit token (write-only, embeddable) and a secret admin key (read+resolve, terminal-only). Keys are stored only as SHA-256 hashes, never in plaintext.
- Token format: `<prefix>_<slug>_<secret>` where prefix is `fbk` (submit) or `fba` (admin).
- Feedback categories: `idea`, `bug`, `other`. Statuses: `new`, `in_progress`, `done`.
- Every read is scoped to exactly one project server-side; there is no code path that returns another project's rows.

---

## File Structure

```
feedback-sdk/
  package.json                 # workspaces root; convex + test tooling
  vitest.config.ts             # edge-runtime env; inline convex-test
  tsconfig.json
  convex/
    schema.ts                  # projects + feedback tables
    keys.ts                    # pure helpers: token format, sha256, secrets, bearer parse
    keys.test.ts
    projects.ts                # create (mint keys)
    projects.test.ts
    feedback.ts                # internal query/mutation used by HTTP layer
    http.ts                    # POST /submit, GET /feedback, POST /feedback/resolve
    http.test.ts
    tsconfig.json
  packages/
    client/
      package.json
      src/index.ts             # submitFeedback() over fetch
      src/index.test.ts
```

Responsibilities:
- `keys.ts` -- pure, dependency-free string/crypto helpers; usable in functions and tests.
- `projects.ts` -- provisioning: mint a project and return its two plaintext keys once.
- `feedback.ts` -- the only place that touches the `feedback` table; internal-only.
- `http.ts` -- the public surface; auth + validation, delegates all DB work to internal functions.
- `packages/client` -- the reusable submit call the widget (Plan 2) and any code can use.

---

### Task 1: Repo scaffold and Convex bootstrap

**Files:**
- Create: `package.json`, `vitest.config.ts`, `tsconfig.json`, `convex/tsconfig.json`, `.gitignore`

**Interfaces:**
- Produces: an installable workspace where `npx convex dev` generates `convex/_generated/` and `npm test` runs Vitest with convex-test.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.env.local
convex/_generated/
dist/
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "feedback-sdk",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "convex dev",
    "test": "vitest run"
  },
  "dependencies": {
    "convex": "^1.27.0"
  },
  "devDependencies": {
    "@edge-runtime/vm": "^5.0.0",
    "convex-test": "^0.0.54",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

// edge-runtime gives Web APIs (crypto, fetch) that convex-test and the
// client rely on; convex-test must be inlined so it loads as ESM.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["convex", "packages"]
}
```

- [ ] **Step 5: Create `convex/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["./**/*"],
  "exclude": ["./_generated"]
}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes; `node_modules/` present.

- [ ] **Step 7: Generate the Convex API (interactive, human-run)**

This step needs a Convex login and provisions a dev deployment; it cannot run headless. Ask the human partner to run it in the session:

Run: `! npx convex dev --once`
Expected: prints a deployment URL, creates `convex/_generated/`, and writes `CONVEX_DEPLOYMENT` + `VITE_CONVEX_URL` to `.env.local`. (At this point `convex/` has no functions yet, which is fine -- codegen still runs.)

Note: re-run `npx convex dev --once` after adding each new function file so `convex/_generated/api` picks up the new module before its test imports it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold convex workspace and test tooling"
```

---

### Task 2: Schema

**Files:**
- Create: `convex/schema.ts`

**Interfaces:**
- Produces tables:
  - `projects`: `{ slug: string, submitTokenHash: string, adminKeyHash: string, owner: string | null, createdAt: number }` with indexes `by_slug`, `by_submit_hash`, `by_admin_hash`.
  - `feedback`: `{ projectId: Id<"projects">, category: string, message: string, pageContext: string | null, metadata: string | null, submitter: string | null, status: string, createdAt: number, updatedAt: number }` with index `by_project` on `["projectId", "createdAt"]`.

- [ ] **Step 1: Write `convex/schema.ts`**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    slug: v.string(),
    submitTokenHash: v.string(),
    adminKeyHash: v.string(),
    // null while single-tenant; becomes the tenancy boundary when public.
    owner: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_submit_hash", ["submitTokenHash"])
    .index("by_admin_hash", ["adminKeyHash"]),

  feedback: defineTable({
    projectId: v.id("projects"),
    category: v.string(),
    message: v.string(),
    pageContext: v.union(v.string(), v.null()),
    // JSON stringified freeform blob from the host app.
    metadata: v.union(v.string(), v.null()),
    submitter: v.union(v.string(), v.null()),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId", "createdAt"]),
});
```

- [ ] **Step 2: Regenerate the API**

Run: `! npx convex dev --once`
Expected: no schema errors; `convex/_generated` updated.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add projects and feedback tables"
```

---

### Task 3: Key helpers (`keys.ts`)

**Files:**
- Create: `convex/keys.ts`, `convex/keys.test.ts`

**Interfaces:**
- Produces:
  - `TOKEN_PREFIXES = { submit: "fbk", admin: "fba" } as const`
  - `randomSecret(): string` -- 48 hex chars from 24 random bytes.
  - `makeToken(prefix: string, slug: string, secret: string): string` -- `` `${prefix}_${slug}_${secret}` ``.
  - `parseToken(token: string): { prefix: string; slug: string; secret: string } | null`.
  - `sha256Hex(input: string): Promise<string>` -- lowercase hex SHA-256.
  - `bearerToken(request: Request): string | null` -- reads `Authorization: Bearer <token>`.

- [ ] **Step 1: Write the failing test `convex/keys.test.ts`**

```ts
import { expect, test } from "vitest";
import {
  TOKEN_PREFIXES,
  randomSecret,
  makeToken,
  parseToken,
  sha256Hex,
  bearerToken,
} from "./keys";

test("randomSecret returns 48 hex chars and differs each call", () => {
  const a = randomSecret();
  const b = randomSecret();
  expect(a).toMatch(/^[0-9a-f]{48}$/);
  expect(a).not.toBe(b);
});

test("makeToken/parseToken round-trip", () => {
  const token = makeToken(TOKEN_PREFIXES.submit, "euno", "deadbeef");
  expect(token).toBe("fbk_euno_deadbeef");
  expect(parseToken(token)).toEqual({
    prefix: "fbk",
    slug: "euno",
    secret: "deadbeef",
  });
});

test("parseToken returns null on malformed input", () => {
  expect(parseToken("nope")).toBeNull();
  expect(parseToken("fbk_euno")).toBeNull();
});

test("sha256Hex is stable and 64 hex chars", async () => {
  const h = await sha256Hex("fbk_euno_deadbeef");
  expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(await sha256Hex("fbk_euno_deadbeef")).toBe(h);
});

test("bearerToken extracts the token or null", () => {
  const withAuth = new Request("http://x/submit", {
    headers: { Authorization: "Bearer fbk_euno_deadbeef" },
  });
  expect(bearerToken(withAuth)).toBe("fbk_euno_deadbeef");
  expect(bearerToken(new Request("http://x/submit"))).toBeNull();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run convex/keys.test.ts`
Expected: FAIL -- cannot resolve `./keys`.

- [ ] **Step 3: Implement `convex/keys.ts`**

```ts
// Pure, dependency-free helpers shared by functions and tests.
// Web Crypto (crypto.subtle, crypto.getRandomValues) is available in the
// Convex runtime and in the edge-runtime test environment.

export const TOKEN_PREFIXES = { submit: "fbk", admin: "fba" } as const;

export function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeToken(prefix: string, slug: string, secret: string): string {
  return `${prefix}_${slug}_${secret}`;
}

export function parseToken(
  token: string,
): { prefix: string; slug: string; secret: string } | null {
  const parts = token.split("_");
  if (parts.length !== 3) return null;
  const [prefix, slug, secret] = parts;
  if (!prefix || !slug || !secret) return null;
  return { prefix, slug, secret };
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run convex/keys.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/keys.ts convex/keys.test.ts
git commit -m "feat(keys): add token, hashing, and bearer helpers"
```

---

### Task 4: Provision a project (`projects.create`)

**Files:**
- Create: `convex/projects.ts`, `convex/projects.test.ts`

**Interfaces:**
- Consumes: `keys.ts` (`makeToken`, `randomSecret`, `sha256Hex`, `TOKEN_PREFIXES`).
- Produces: public mutation `api.projects.create`, args `{ slug: string }`, returns `{ projectId: Id<"projects">, submitToken: string, adminKey: string }`. Rejects blank or duplicate slug. Stores only hashes.

Note: this mutation is unauthenticated in the skeleton (called via `npx convex run`). Plan 3 (CLI) hardens provisioning behind a deploy-level secret.

- [ ] **Step 1: Write the failing test `convex/projects.test.ts`**

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { sha256Hex } from "./keys";

const modules = import.meta.glob("./**/*.ts");

test("create mints a project, returns two tokens, stores only hashes", async () => {
  const t = convexTest(schema, modules);
  const res = await t.mutation(api.projects.create, { slug: "euno" });

  expect(res.submitToken).toMatch(/^fbk_euno_[0-9a-f]{48}$/);
  expect(res.adminKey).toMatch(/^fba_euno_[0-9a-f]{48}$/);

  const project = await t.run((ctx) => ctx.db.get(res.projectId));
  expect(project?.slug).toBe("euno");
  expect(project?.owner).toBeNull();
  expect(project?.submitTokenHash).toBe(await sha256Hex(res.submitToken));
  expect(project?.adminKeyHash).toBe(await sha256Hex(res.adminKey));
  // Plaintext tokens must never be persisted.
  expect(JSON.stringify(project)).not.toContain(res.submitToken);
});

test("create rejects a blank slug", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.projects.create, { slug: "  " })).rejects.toThrow(
    "Slug is required",
  );
});

test("create rejects a duplicate slug", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { slug: "euno" });
  await expect(
    t.mutation(api.projects.create, { slug: "euno" }),
  ).rejects.toThrow("Project already exists");
});
```

- [ ] **Step 2: Regenerate API then run the test to confirm it fails**

Run: `! npx convex dev --once` then `npx vitest run convex/projects.test.ts`
Expected: FAIL -- `api.projects` has no `create`.

- [ ] **Step 3: Implement `convex/projects.ts`**

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { makeToken, randomSecret, sha256Hex, TOKEN_PREFIXES } from "./keys";

export const create = mutation({
  args: { slug: v.string() },
  returns: v.object({
    projectId: v.id("projects"),
    submitToken: v.string(),
    adminKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const slug = args.slug.trim();
    if (slug === "") {
      throw new Error("Slug is required");
    }
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing !== null) {
      throw new Error("Project already exists");
    }
    const submitToken = makeToken(TOKEN_PREFIXES.submit, slug, randomSecret());
    const adminKey = makeToken(TOKEN_PREFIXES.admin, slug, randomSecret());
    const projectId = await ctx.db.insert("projects", {
      slug,
      submitTokenHash: await sha256Hex(submitToken),
      adminKeyHash: await sha256Hex(adminKey),
      owner: null,
      createdAt: Date.now(),
    });
    return { projectId, submitToken, adminKey };
  },
});
```

- [ ] **Step 4: Regenerate API then run tests to confirm pass**

Run: `! npx convex dev --once` then `npx vitest run convex/projects.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/projects.ts convex/projects.test.ts
git commit -m "feat(projects): mint a project with two hashed keys"
```

---

### Task 5: Internal feedback functions (`feedback.ts`)

**Files:**
- Create: `convex/feedback.ts`, `convex/feedback.test.ts`

**Interfaces:**
- Consumes: `schema` tables.
- Produces (all `internal.feedback.*`):
  - `projectBySubmitHash` internalQuery: `{ hash: string }` -> `Id<"projects"> | null`.
  - `projectByAdminHash` internalQuery: `{ hash: string }` -> `Id<"projects"> | null`.
  - `insert` internalMutation: `{ projectId, category, message, pageContext, metadata, submitter }` -> `Id<"feedback">`. Sets status `new` and timestamps.
  - `listByProject` internalQuery: `{ projectId, status?: string }` -> array of feedback docs, newest first, bounded to 100.
  - `setStatus` internalMutation: `{ projectId, id, status }` -> `boolean` (false if the row is missing or not in that project).

- [ ] **Step 1: Write the failing test `convex/feedback.test.ts`**

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function projectId(t: ReturnType<typeof convexTest>, slug: string) {
  const res = await t.mutation(api.projects.create, { slug });
  return res.projectId;
}

test("insert stores a new-status row with timestamps", async () => {
  const t = convexTest(schema, modules);
  const pid = await projectId(t, "euno");
  const id = await t.mutation(internal.feedback.insert, {
    projectId: pid,
    category: "bug",
    message: "search is broken",
    pageContext: "/search",
    metadata: null,
    submitter: null,
  });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.status).toBe("new");
  expect(row?.message).toBe("search is broken");
  expect(typeof row?.createdAt).toBe("number");
});

test("listByProject returns only that project's rows, newest first", async () => {
  const t = convexTest(schema, modules);
  const euno = await projectId(t, "euno");
  const todo = await projectId(t, "todo");
  await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "idea", message: "first",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "idea", message: "second",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.insert, {
    projectId: todo, category: "idea", message: "other project",
    pageContext: null, metadata: null, submitter: null,
  });

  const rows = await t.query(internal.feedback.listByProject, {
    projectId: euno,
  });
  expect(rows.map((r) => r.message)).toEqual(["second", "first"]);
});

test("listByProject filters by status when given", async () => {
  const t = convexTest(schema, modules);
  const euno = await projectId(t, "euno");
  const a = await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "bug", message: "a",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "bug", message: "b",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.setStatus, {
    projectId: euno, id: a, status: "done",
  });
  const open = await t.query(internal.feedback.listByProject, {
    projectId: euno, status: "new",
  });
  expect(open.map((r) => r.message)).toEqual(["b"]);
});

test("setStatus refuses a row from another project", async () => {
  const t = convexTest(schema, modules);
  const euno = await projectId(t, "euno");
  const todo = await projectId(t, "todo");
  const id = await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "bug", message: "a",
    pageContext: null, metadata: null, submitter: null,
  });
  const ok = await t.mutation(internal.feedback.setStatus, {
    projectId: todo, id, status: "done",
  });
  expect(ok).toBe(false);
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.status).toBe("new");
});

test("projectBySubmitHash and projectByAdminHash resolve the right project", async () => {
  const t = convexTest(schema, modules);
  const res = await t.mutation(api.projects.create, { slug: "euno" });
  const project = await t.run((ctx) => ctx.db.get(res.projectId));
  const bySubmit = await t.query(internal.feedback.projectBySubmitHash, {
    hash: project!.submitTokenHash,
  });
  const byAdmin = await t.query(internal.feedback.projectByAdminHash, {
    hash: project!.adminKeyHash,
  });
  expect(bySubmit).toBe(res.projectId);
  expect(byAdmin).toBe(res.projectId);
  expect(
    await t.query(internal.feedback.projectBySubmitHash, { hash: "nope" }),
  ).toBeNull();
});
```

- [ ] **Step 2: Regenerate API then run the test to confirm it fails**

Run: `! npx convex dev --once` then `npx vitest run convex/feedback.test.ts`
Expected: FAIL -- `internal.feedback` has no members.

- [ ] **Step 3: Implement `convex/feedback.ts`**

```ts
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const LIST_LIMIT = 100;

export const projectBySubmitHash = internalQuery({
  args: { hash: v.string() },
  returns: v.union(v.id("projects"), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_submit_hash", (q) => q.eq("submitTokenHash", args.hash))
      .unique();
    return project === null ? null : project._id;
  },
});

export const projectByAdminHash = internalQuery({
  args: { hash: v.string() },
  returns: v.union(v.id("projects"), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_admin_hash", (q) => q.eq("adminKeyHash", args.hash))
      .unique();
    return project === null ? null : project._id;
  },
});

export const insert = internalMutation({
  args: {
    projectId: v.id("projects"),
    category: v.string(),
    message: v.string(),
    pageContext: v.union(v.string(), v.null()),
    metadata: v.union(v.string(), v.null()),
    submitter: v.union(v.string(), v.null()),
  },
  returns: v.id("feedback"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("feedback", {
      projectId: args.projectId,
      category: args.category,
      message: args.message,
      pageContext: args.pageContext,
      metadata: args.metadata,
      submitter: args.submitter,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listByProject = internalQuery({
  args: { projectId: v.id("projects"), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(LIST_LIMIT);
    if (args.status === undefined) return rows;
    return rows.filter((r) => r.status === args.status);
  },
});

export const setStatus = internalMutation({
  args: {
    projectId: v.id("projects"),
    id: v.id("feedback"),
    status: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    // Never touch a row that is missing or belongs to another project.
    if (row === null || row.projectId !== args.projectId) {
      return false;
    }
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    return true;
  },
});
```

- [ ] **Step 4: Regenerate API then run tests to confirm pass**

Run: `! npx convex dev --once` then `npx vitest run convex/feedback.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/feedback.ts convex/feedback.test.ts
git commit -m "feat(feedback): add internal project-scoped feedback functions"
```

---

### Task 6: HTTP endpoints (`http.ts`)

**Files:**
- Create: `convex/http.ts`, `convex/http.test.ts`

**Interfaces:**
- Consumes: `keys.ts` (`bearerToken`, `parseToken`, `sha256Hex`, `TOKEN_PREFIXES`), `internal.feedback.*`.
- Produces HTTP routes on the deployment's site URL:
  - `POST /submit` -- header `Authorization: Bearer <submitToken>`; JSON body `{ message: string, category?: string, pageContext?: string, metadata?: object, submitter?: string }`; 200 `{ id }`, 400 on bad input, 401 on bad token.
  - `GET /feedback?status=<status>` -- header `Authorization: Bearer <adminKey>`; 200 `{ feedback: [...] }`, 401 on bad key.
  - `POST /feedback/resolve` -- header `Authorization: Bearer <adminKey>`; JSON body `{ id: string, status: string }`; 200 `{ ok: true }`, 400/404 otherwise, 401 on bad key.

- [ ] **Step 1: Write the failing test `convex/http.test.ts`**

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function project(t: ReturnType<typeof convexTest>, slug: string) {
  return await t.mutation(api.projects.create, { slug });
}

function submit(t: ReturnType<typeof convexTest>, token: string, body: unknown) {
  return t.fetch("/submit", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("submit with a valid token stores feedback and returns its id", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await submit(t, euno.submitToken, {
    message: "search is broken",
    category: "bug",
    pageContext: "/search",
  });
  expect(res.status).toBe(200);
  const { id } = await res.json();
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.projectId).toBe(euno.projectId);
  expect(row?.message).toBe("search is broken");
});

test("submit rejects a bad token with 401", async () => {
  const t = convexTest(schema, modules);
  await project(t, "euno");
  const res = await submit(t, "fbk_euno_wrong", { message: "x" });
  expect(res.status).toBe(401);
});

test("submit rejects an empty message with 400", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await submit(t, euno.submitToken, { message: "   " });
  expect(res.status).toBe(400);
});

test("submit rejects an unknown category with 400", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await submit(t, euno.submitToken, {
    message: "hi", category: "spam",
  });
  expect(res.status).toBe(400);
});

test("GET /feedback returns only the caller's project rows", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const todo = await project(t, "todo");
  await submit(t, euno.submitToken, { message: "euno one" });
  await submit(t, todo.submitToken, { message: "todo one" });

  const res = await t.fetch("/feedback", {
    headers: { Authorization: `Bearer ${euno.adminKey}` },
  });
  expect(res.status).toBe(200);
  const { feedback } = await res.json();
  expect(feedback.map((r: { message: string }) => r.message)).toEqual([
    "euno one",
  ]);
});

test("GET /feedback rejects a submit token used as an admin key", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await t.fetch("/feedback", {
    headers: { Authorization: `Bearer ${euno.submitToken}` },
  });
  expect(res.status).toBe(401);
});

test("resolve flips status and is rejected for another project", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const todo = await project(t, "todo");
  const submitRes = await submit(t, euno.submitToken, { message: "fix me" });
  const { id } = await submitRes.json();

  // Wrong project's admin key cannot resolve euno's row.
  const wrong = await t.fetch("/feedback/resolve", {
    method: "POST",
    headers: { Authorization: `Bearer ${todo.adminKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "done" }),
  });
  expect(wrong.status).toBe(404);

  const ok = await t.fetch("/feedback/resolve", {
    method: "POST",
    headers: { Authorization: `Bearer ${euno.adminKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "done" }),
  });
  expect(ok.status).toBe(200);
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.status).toBe("done");
});
```

- [ ] **Step 2: Regenerate API then run the test to confirm it fails**

Run: `! npx convex dev --once` then `npx vitest run convex/http.test.ts`
Expected: FAIL -- no routes registered (404s / import error).

- [ ] **Step 3: Implement `convex/http.ts`**

```ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { bearerToken, parseToken, sha256Hex, TOKEN_PREFIXES } from "./keys";

const CATEGORIES = ["idea", "bug", "other"];
const STATUSES = ["new", "in_progress", "done"];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Resolve a bearer token of the expected kind to its project id, or null.
async function projectForToken(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  request: Request,
  kind: "submit" | "admin",
): Promise<string | null> {
  const token = bearerToken(request);
  if (token === null) return null;
  const parsed = parseToken(token);
  if (parsed === null || parsed.prefix !== TOKEN_PREFIXES[kind]) return null;
  const hash = await sha256Hex(token);
  const query =
    kind === "submit"
      ? internal.feedback.projectBySubmitHash
      : internal.feedback.projectByAdminHash;
  return await ctx.runQuery(query, { hash });
}

const submit = httpAction(async (ctx, request) => {
  const projectId = await projectForToken(ctx, request, "submit");
  if (projectId === null) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message === "") return json({ error: "Message is required" }, 400);

  const category = typeof body.category === "string" ? body.category : "idea";
  if (!CATEGORIES.includes(category)) {
    return json({ error: "Unknown category" }, 400);
  }

  const pageContext =
    typeof body.pageContext === "string" ? body.pageContext : null;
  const submitter = typeof body.submitter === "string" ? body.submitter : null;
  const metadata =
    body.metadata === undefined || body.metadata === null
      ? null
      : JSON.stringify(body.metadata);

  const id = await ctx.runMutation(internal.feedback.insert, {
    projectId: projectId as never,
    category,
    message,
    pageContext,
    metadata,
    submitter,
  });
  return json({ id }, 200);
});

const list = httpAction(async (ctx, request) => {
  const projectId = await projectForToken(ctx, request, "admin");
  if (projectId === null) return json({ error: "Unauthorized" }, 401);

  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  const feedback = await ctx.runQuery(internal.feedback.listByProject, {
    projectId: projectId as never,
    status,
  });
  return json({ feedback }, 200);
});

const resolve = httpAction(async (ctx, request) => {
  const projectId = await projectForToken(ctx, request, "admin");
  if (projectId === null) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (id === "" || !STATUSES.includes(status)) {
    return json({ error: "Invalid id or status" }, 400);
  }

  const ok = await ctx.runMutation(internal.feedback.setStatus, {
    projectId: projectId as never,
    id: id as never,
    status,
  });
  if (!ok) return json({ error: "Not found" }, 404);
  return json({ ok: true }, 200);
});

const http = httpRouter();
http.route({ path: "/submit", method: "POST", handler: submit });
http.route({ path: "/feedback", method: "GET", handler: list });
http.route({ path: "/feedback/resolve", method: "POST", handler: resolve });

export default http;
```

- [ ] **Step 4: Regenerate API then run tests to confirm pass**

Run: `! npx convex dev --once` then `npx vitest run convex/http.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS -- all files green.

- [ ] **Step 6: Commit**

```bash
git add convex/http.ts convex/http.test.ts
git commit -m "feat(http): add submit, list, and resolve endpoints with two-key auth"
```

---

### Task 7: Client core (`packages/client`)

**Files:**
- Create: `packages/client/package.json`, `packages/client/src/index.ts`, `packages/client/src/index.test.ts`

**Interfaces:**
- Produces: `submitFeedback(options): Promise<{ id: string }>` where options are
  `{ endpoint: string; token: string; message: string; category?: "idea" | "bug" | "other"; pageContext?: string; metadata?: Record<string, unknown>; submitter?: string; fetchImpl?: typeof fetch }`.
  POSTs to `` `${endpoint}/submit` `` with the bearer token; throws `Error` with the server message on non-2xx.

- [ ] **Step 1: Create `packages/client/package.json`**

```json
{
  "name": "@feedback-sdk/client",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run" }
}
```

- [ ] **Step 2: Write the failing test `packages/client/src/index.test.ts`**

```ts
import { expect, test, vi } from "vitest";
import { submitFeedback } from "./index";

function okFetch(payload: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

test("submitFeedback posts to /submit with the bearer token and body", async () => {
  const fetchImpl = okFetch({ id: "fb_1" });
  const result = await submitFeedback({
    endpoint: "https://x.convex.site",
    token: "fbk_euno_secret",
    message: "search broke",
    category: "bug",
    pageContext: "/search",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(result).toEqual({ id: "fb_1" });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://x.convex.site/submit");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer fbk_euno_secret");
  expect(JSON.parse(init.body)).toEqual({
    message: "search broke",
    category: "bug",
    pageContext: "/search",
  });
});

test("submitFeedback throws the server error message on failure", async () => {
  const fetchImpl = vi.fn(async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  );
  await expect(
    submitFeedback({
      endpoint: "https://x.convex.site",
      token: "bad",
      message: "hi",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow("Unauthorized");
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run packages/client/src/index.test.ts`
Expected: FAIL -- cannot resolve `./index`.

- [ ] **Step 4: Implement `packages/client/src/index.ts`**

```ts
export type FeedbackCategory = "idea" | "bug" | "other";

export interface SubmitFeedbackOptions {
  endpoint: string;
  token: string;
  message: string;
  category?: FeedbackCategory;
  pageContext?: string;
  metadata?: Record<string, unknown>;
  submitter?: string;
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch;
}

export async function submitFeedback(
  options: SubmitFeedbackOptions,
): Promise<{ id: string }> {
  const doFetch = options.fetchImpl ?? fetch;

  // Only send the fields the caller set, so the server applies its defaults.
  const body: Record<string, unknown> = { message: options.message };
  if (options.category !== undefined) body.category = options.category;
  if (options.pageContext !== undefined) body.pageContext = options.pageContext;
  if (options.metadata !== undefined) body.metadata = options.metadata;
  if (options.submitter !== undefined) body.submitter = options.submitter;

  const response = await doFetch(`${options.endpoint}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Feedback submit failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // keep the status-code fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as { id: string };
}
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `npx vitest run packages/client/src/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/client
git commit -m "feat(client): add submitFeedback over fetch"
```

---

### Task 8: Live end-to-end verification

**Files:** none (manual verification against the real dev deployment).

**Interfaces:** proves the deployed HTTP surface, not just the in-memory test harness.

- [ ] **Step 1: Ensure the dev deployment is running**

Run: `! npx convex dev` (leave running, or use the deployment from earlier `--once` runs).
Capture the site URL: the value of `VITE_CONVEX_URL` with the `.convex.cloud` host swapped for `.convex.site` (HTTP actions are served from the `.site` host). Confirm it in the Convex dashboard's Settings -> URL if unsure.

- [ ] **Step 2: Mint a real project**

Run: `npx convex run projects:create '{"slug":"euno"}'`
Expected: prints `{ projectId, submitToken, adminKey }`. Copy the two tokens.

- [ ] **Step 3: Submit feedback over real HTTP**

Run (substitute the site URL and submit token):
```bash
curl -s -X POST "$SITE_URL/submit" \
  -H "Authorization: Bearer $SUBMIT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"live smoke test","category":"bug","pageContext":"/search"}'
```
Expected: `{"id":"..."}` with HTTP 200.

- [ ] **Step 4: Read it back with the admin key**

Run:
```bash
curl -s "$SITE_URL/feedback" -H "Authorization: Bearer $ADMIN_KEY"
```
Expected: JSON with the `live smoke test` row, `status: "new"`.

- [ ] **Step 5: Confirm isolation with a bad key**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "$SITE_URL/feedback" \
  -H "Authorization: Bearer fba_euno_wrong"
```
Expected: `401`.

- [ ] **Step 6: Record the result**

No commit (no files changed). Note in the PR description that the live loop passed: mint -> submit -> read -> isolation.

---

## Self-Review

**Spec coverage:**
- Isolated per-project store -> Tasks 2, 5, 6 (projectId scoping, explicit cross-project tests). Covered.
- Two-key credential model, hashed storage -> Tasks 3, 4, 6. Covered.
- Zero-setup provisioning -> Task 4 `projects.create` (CLI wrapper is Plan 3, noted). Partial by design.
- Feedback fields (category, message, pageContext, metadata, submitter, status) -> Tasks 2, 5, 6. Covered.
- Anonymous submission allowed -> submit takes no user identity; `submitter` optional. Covered.
- Agent read/react primitives -> HTTP `GET /feedback` + `POST /feedback/resolve` (MCP/webhook are Plan 4, noted). Partial by design.
- Widget + React/Svelte integrations -> deferred to Plan 2 (out of this plan's scope). Noted.
- Rate limiting -> spec item; deferred to a later hardening task with the CLI (Plan 3), since the skeleton runs against a private dev deployment. Flagged here so it is not forgotten.

**Placeholder scan:** none -- every code and command step is concrete.

**Type consistency:** `projectBySubmitHash`/`projectByAdminHash` return `Id<"projects"> | null` and are consumed that way in `http.ts`; `insert`/`setStatus`/`listByProject` arg names match between `feedback.ts`, its tests, and `http.ts`; `submitFeedback` option names match between client impl and its test. Consistent.

**Deferred to later plans (tracked):** CLI `init` and provisioning hardening (Plan 3), rate limiting (Plan 3), the widget and Euno/tony-todo integrations (Plan 2), MCP server and webhook event (Plan 4).
