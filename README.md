# feedback-sdk

A feedback button whose inbox is an agent work queue.

Drop a small widget into any app. Users (or you, while dogfooding) submit
feedback from inside the product. It lands in an isolated per-project store that
a coding agent reads and acts on -- so the loop is "hit a bug, type it in the
app, keep going," instead of stopping to re-explain it in a terminal.

Think Sentry, except the triager on the other end is your agent, not a dashboard.

## Status

Early, but usable from anywhere. The widget is published on npm as
[`feedback-sdk-widget`](https://www.npmjs.com/package/feedback-sdk-widget), and
the service runs either as a **local** Convex deployment (offline dev) or a
**cloud** deployment (a public URL any app or agent can reach). Multi-tenant
accounts, a provisioning CLI, and an MCP server are still ahead -- see Roadmap.

## What's here

```
convex/            the service: schema, projects, feedback, HTTP endpoints (two-key auth, CORS)
packages/client/   submitFeedback() -- the tiny POST the widget makes
packages/widget/   <feedback-widget> framework-agnostic web component (Shadow DOM, themeable)
examples/demo.html a standalone page to try the widget with no app
docs/TESTING.md    step-by-step: run it and test it yourself
docs/design/       the design spec
docs/plans/        the phased implementation plans
```

## Quickstart

**You deploy the service once.**
**Every app after that is `npm install` plus two env vars.**

If you are wiring an existing app to a service someone else already runs, skip straight to [`INTEGRATING.md`](INTEGRATING.md) -- you do not need this repo at all.

### (a) Run the service (once, owner only)

```bash
npx convex dev
#    leave this running; copy CONVEX_SITE_URL from .env.local -> this is your $SITE
```

That's it. One deployment serves every app you add below.

### (b) Add an app to your service

Each app gets its own project: a public **submit token** and a secret **admin key**.
Two ways to mint one:

**Over HTTP, with the owner key (no repo checkout needed):**

```bash
# once: turn on provisioning for your deployment
npx convex env set FEEDBACK_OWNER_KEY <a-long-random-string>

# then, from anywhere, including from an agent with no Convex access:
curl -s -X POST "$SITE/projects" \
  -H "Authorization: Bearer <your-FEEDBACK_OWNER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"myapp"}'
# -> { "projectId", "submitToken", "adminKey" }
```

`FEEDBACK_OWNER_KEY` is unset by default, so `/projects` returns 404 until you opt in.

**From a checkout of this repo (the original path, still works):**

```bash
npx convex run projects:create '{"slug":"myapp"}'
```

### (c) Integrate the widget in the app

```bash
npm install feedback-sdk-widget
```

Set two env vars in the app: the service URL (`$SITE`, i.e. `CONVEX_SITE_URL`) and the submit token from step (b).
Then mount the tag:

```js
import "feedback-sdk-widget";
// <feedback-widget endpoint={SITE} token={SUBMIT_TOKEN}></feedback-widget>
```

**The integrating app never clones this repo and never touches Convex.**
See [`INTEGRATING.md`](INTEGRATING.md) for the full playbook, including the SSR-safe import pattern for React/Svelte/Next.js and the agent read/resolve loop.

Full local walkthrough, including the demo page: [`docs/TESTING.md`](docs/TESTING.md).

## Using the widget in an app

The widget is a browser custom element.
As of 0.3.0 a top-level import is safe under server-side rendering: on the server the element simply does not register, and it upgrades normally in the browser.
On 0.2.x and older, a top-level import crashes SSR frameworks (Next.js, SvelteKit, Nuxt) because `HTMLElement` does not exist on the server -- use the dynamic-import patterns below there.
They also remain useful on 0.3.0+ to keep the widget out of your server bundle:

Plain client-side app (Vite/CRA, no SSR):

```js
import "feedback-sdk-widget";
// <feedback-widget endpoint="https://your-service" token="fbk_myapp_..."></feedback-widget>
```

React with SSR / Next.js -- import in an effect:

```jsx
import { useEffect } from "react";
export function Feedback({ endpoint, token }) {
  useEffect(() => { import("feedback-sdk-widget"); }, []);
  return <feedback-widget endpoint={endpoint} token={token} />;
}
```

SvelteKit -- import in `onMount` (browser only):

```svelte
<script>
  import { onMount } from "svelte";
  onMount(() => import("feedback-sdk-widget"));
</script>
<feedback-widget {endpoint} {token}></feedback-widget>
```

Attributes:

- `endpoint` (required) -- your service URL (`CONVEX_SITE_URL`)
- `token` (required) -- the project's public submit token (`fbk_...`)
- optional: `categories` (csv), `page-context`, `label`, `submitter`
- `theme` -- `light` (default), `dark`, or `auto` (follows the OS via
  `prefers-color-scheme`). Dark apps want `theme="dark"` or `theme="auto"`.
- theming: override `--fw-accent`, `--fw-surface`, `--fw-text`, `--fw-radius`, and
  friends. These win over the `theme` presets, so you can start from `dark` and
  retune a variable or two.
- fires `feedback-submitted` (`CustomEvent<{ id: string }>`) on success

The panel has an "Attach screenshot" control: the submitter can attach an image
(a screenshot they took) so the agent gets visual context alongside the text.
The image is stored in the service, and each row in the read below carries a
`screenshotUrl` (or `null`) the agent can fetch. Max 3 MB per image.

The public submit token is safe to ship in your app. The admin key is not -- it
stays in your terminal/agent.

## The agent loop

Feedback is read and resolved over HTTP with the admin key. An agent can run
these directly:

```bash
# read the queue (newest first)
curl -s "$SITE/feedback" -H "Authorization: Bearer $ADMIN_KEY"

# mark one handled
curl -s -X POST "$SITE/feedback/resolve" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"id":"<feedback id>","status":"done"}'

# delete one (spam / noise)
curl -s -X POST "$SITE/feedback/delete" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"id":"<feedback id>"}'
```

So in practice: submit feedback from the app, then tell your agent "read the
feedback for `myapp` and fix the top item."

## Security model

- Two keys per project: a public **submit token** (write-only, embeddable,
  one project) and a secret **admin key** (read + resolve, terminal-only). Keys
  are stored hashed.
- Every read is scoped to exactly one project server-side -- one project can
  never read another's feedback.
- The submit endpoint sends CORS headers so the browser widget can post
  cross-origin; tokens, not origin, are the security boundary.
- The `POST /projects` provisioning endpoint is a third, separate key
  (`FEEDBACK_OWNER_KEY`, a deployment env var, never in the widget or the
  app). Unset by default -- provisioning is opt-in, not on by default.

## Development

```bash
npm install
npx convex dev --once   # generate the API / deploy locally
npm test                # service, client, widget
```

## Roadmap

- Done: widget published to npm; service deployable to a public cloud endpoint.
- Done: owner-key `POST /projects` endpoint -- provisioning is now possible
  over HTTP, no repo checkout required.
- Done: `npx feedback-sdk-cli init` as a friendlier wrapper over the same
  endpoint (published as `feedback-sdk-cli` -- the name `feedback-sdk` was
  blocked by npm's collision check against an unrelated package).
- Done: MCP server (`feedback-sdk-mcp`) so agents get `feedback_list` /
  `feedback_resolve` / `feedback_delete` tools directly.
- Done: light/dark/auto theming (`theme="dark"` / `"auto"`) and an SSR-safe
  top-level import for the widget, as of 0.3.0.
- Multi-tenant (accounts, dashboard) to open it beyond a single owner.
