# Feedback SDK -- design spec

Status: approved design, pre-implementation
Date: 2026-07-16
Working name: feedback-sdk (final product/package name still open)

## One-line summary

A standalone service that stores product feedback isolated per project, a
framework-agnostic button that writes to it, and a set of read/react primitives
that any coding agent can pick up. "Sentry, but the triager is your agent."

## The problem, and why this exists

When you are building or testing a product and hit a bug or an idea, today you
stop, switch to the terminal, and re-explain to an agent what you just saw. That
context-switch is the tax. The loop should be: stay in the product, type the
feedback right where you found it, submit, keep going -- and later just tell an
agent "look at the feedback and work on it," or wire an automation that picks it
up on its own.

The feedback becomes an agent work queue, not a chart for a human to read. That
is the whole difference from existing tools (PostHog Surveys, Canny,
Featurebase, Sentry user feedback): those all put a human on the receiving end
in a dashboard. Here the receiver is a coding agent.

## Goals

- Add feedback to any app by installing a library and adding a line or two. No
  database to set up, no schema to write, no auth to wire.
- Each project gets its own isolated store, created automatically.
- The store is readable and mutable by agents through clean primitives (MCP, an
  API, a webhook) so the developer decides how to consume it.
- Real end-users of the product can submit feedback without being forced to log
  in; the developer can also submit while dogfooding.

## Non-goals (v1)

- No screenshots or file attachments.
- No upvoting / public roadmap.
- No email or push notifications.
- No analytics, charts, or trends.
- No prescribed agent workflow. We ship primitives; how feedback gets consumed
  (manual prompt, cron, cloud agent, GitHub issue) is the developer's choice.
  Mechanism, not policy.

## Audience and evolution

Built for one operator's own fleet first (tony-todo-app, Euno, and future apps),
but architected so opening it to other developers later is an unlock, not a
rewrite. Concretely: `projectId` and per-project keys are first-class from day
one, and the `projects` table carries a nullable `owner` field that stays empty
while single-tenant and becomes the tenancy boundary when multi-tenant. No
schema change is needed to go public; the additions are signup, a dashboard, and
billing -- all additive.

Two roads deliberately not taken:
- Not a copy-paste template per app (each app owning its own backend) -- we chose
  a shared service for one story across the fleet and a path to public.
- Not wrapping an existing tool (PostHog/Canny + an MCP shim) -- wrong shape, and
  you would own nothing.

## Architecture -- the pieces

All live in this one repo.

1. **The service (Convex).** The hub. Holds every project and its feedback, each
   row stamped with `projectId` so projects never bleed together. Exposes:
   `submit` (write, gated by the public submit token), `list` / `get` /
   `resolve` (read + mutate, gated by the secret admin key), and an event hook
   that fires on new feedback.
2. **The widget.** A framework-agnostic web component, `<feedback-widget>`. One
   codebase, shipped as an npm package and as a script-tag loader. Carries only
   the public submit token. Reference integrations built and verified first in
   React (Euno) and Svelte (tony-todo-app).
3. **The client core.** The small JS underneath the widget that performs the
   POST. Also usable standalone to submit feedback from code instead of a button.
4. **The CLI.** Setup / provisioning only. `init` creates a project in the
   service, returns its two keys, and prints the widget snippet to paste. (Later
   maybe `keys` to reprint.) The CLI does not read feedback.
5. **The MCP server (battery).** Wires the feedback store into an MCP-aware agent
   (Claude Code, Cursor) as tools, so the operator just says "check Euno's
   feedback." Optional.
6. **The webhook / event (battery).** The push primitive: new feedback can fire
   the developer's own automation. Optional.

Items 1-4 are the v1 core. Items 5-6 ship alongside but nobody is forced to use
them.

### Why Convex

- Auto-provisioning without a database dance: schema-as-code, serverless, so
  onboarding a new project needs no human-run migration. Isolation is a
  `projectId` index.
- The agent read path is nearly free: `npx convex run feedback:list ...` returns
  JSON; the MCP server and API are thin wrappers over the same functions.
- Auto-trigger is native: real-time subscriptions and scheduled/HTTP functions
  make the event hook first-class rather than a cron hack.
- TypeScript end to end across widget, client, and backend.

## Data model

Two tables in the Convex service.

**projects**
- `slug` (string) -- the human label used in tokens, e.g. `euno`, `tony-todo`.
- `submitTokenHash` (string) -- hash of the public submit token.
- `adminKeyHash` (string) -- hash of the secret admin key.
- `owner` (nullable) -- empty while single-tenant; the tenancy boundary later.
- `createdAt` (number).

**feedback**
- `projectId` (indexed) -- scopes every read to exactly one project.
- `category` (string) -- idea / bug / other, configurable per project.
- `message` (string, required) -- the feedback text.
- `pageContext` (string, optional) -- URL/route it was sent from, captured
  automatically so the agent knows where the problem is.
- `metadata` (object, optional) -- freeform blob the host app can attach (app
  version, build, etc.).
- `submitter` (object, optional) -- identity if the host passes a user email/id;
  otherwise anonymous.
- `status` (string) -- new / in_progress / done.
- `createdAt`, `updatedAt` (number).

## Credentials and security

Two credentials per project, same pattern as Stripe (publishable vs secret) and
Sentry (public DSN vs auth token).

- **Public submit token.** Write-only, scoped to one project, safe to embed in
  the browser, rate-limited to blunt spam/bots. Encodes the project slug so the
  service can look up the project, then verifies against the stored hash.
- **Secret admin key.** Read + resolve, one per project, lives only where the
  agent runs (env var / MCP config), never shipped to a browser. One admin key
  reads exactly one project's feedback and nothing else, so a leak of Euno's key
  leaves tony-todo untouched. This per-project scoping is also what multi-tenant
  needs.

Enforcement:
- Keys are stored hashed, never in plaintext.
- The submit endpoint is public (it must be reachable from any browser) and
  rate-limited per token and/or per IP.
- Every read maps its admin key to exactly one project server-side; there is no
  code path that returns another project's rows.

## Provisioning flow (zero-setup)

1. Agent or developer runs `npx feedback-sdk init` inside the target app.
2. The CLI creates the project in the service and prints the two keys plus the
   exact `<feedback-widget>` snippet.
3. The developer/agent pastes the snippet (with the public token) into the app.
4. Done. The store already exists; nothing else to configure.

The developer never creates or manages a key -- the CLI generates them. Only the
public token lands in app code; the admin key goes to the terminal/agent
environment.

## Agent consumption (mechanism, not policy)

The service exposes the feedback data and a change event. How an agent consumes
it is the developer's choice:

- **Pull, via MCP:** tools like `feedback_list`, `feedback_get`,
  `feedback_resolve` for "tell the agent to look."
- **Pull, via API / `convex run`:** for scripts and cron.
- **Push, via the event hook / webhook:** new feedback triggers the developer's
  own automation.

We do not build "the agent" or dictate the workflow.

## Widget delivery

- Framework-agnostic web component so one codebase runs in React, Svelte, Vue, or
  a static HTML page.
- Shipped two ways from the same source: an npm package (`import` then drop the
  element into JSX/markup) and a script-tag loader that self-mounts.
- React (Euno) and Svelte (tony-todo-app) are the two reference integrations,
  built and verified first.
- The widget is intentionally thin -- the button is commodity. Effort concentrates
  on the agent-facing end.

## Repo layout (proposed)

A small monorepo:

```
feedback-sdk/
  convex/            # the service: schema + functions
  packages/
    widget/          # framework-agnostic web component
    client/          # JS client core (the POST)
    cli/             # init / provisioning
    mcp/             # MCP server (battery)
  examples/
    react/           # Euno-style reference integration
    svelte/          # tony-todo-style reference integration
  docs/
    design/          # this spec
```

## Testing strategy

Each package is tested at its own level, proportionate not padded. TDD: write the
test, watch it fail for the right reason, then implement.

- **Service (Convex functions)** -- most coverage, using `convex-test`:
  - submit lands a row tagged to the right project;
  - submit with a bad/missing token is rejected;
  - a read with project A's admin key returns only A's rows and cannot see B's
    (the isolation guarantee, explicitly tested);
  - resolve flips status;
  - rate-limiting triggers.
- **Client core** -- unit tests on payload building and error handling.
- **Widget** -- light DOM tests: open/close, category select, submit fires the
  POST, sent/error states.
- **CLI** -- `init` creates a project and returns two working keys against a test
  deployment.
- **MCP server** -- its tools map correctly onto the read/resolve functions.
- **Reference integrations** -- the real proof: the button renders and submits
  inside Euno (React) and tony-todo-app (Svelte), verified in a real browser as a
  user would, not only unit-tested.

## Open questions (resolve before or during implementation)

- Final product / package name (the working name is a placeholder).
- Where the Convex service is deployed and who owns the deployment for the
  private phase.
- Exact rate-limit thresholds for the public submit endpoint.
- Whether `init` should also scaffold the widget snippet into the app
  automatically or just print it for the agent to paste.
