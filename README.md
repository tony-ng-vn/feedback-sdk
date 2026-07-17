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

## Quickstart (local, ~2 minutes)

```bash
# 1. start the service (leave running; local, no login)
npx convex dev
#    copy CONVEX_SITE_URL from .env.local  -> this is your $SITE

# 2. create a project -> prints a submit token (public) and admin key (secret)
npx convex run projects:create '{"slug":"myapp"}'

# 3. build the widget and open the demo
npm run build --workspace feedback-sdk-widget
npx http-server -p 8080 .
#    open http://localhost:8080/examples/demo.html, paste $SITE + submit token,
#    click Mount, use the Feedback button.
```

Full walkthrough, including wiring the widget into a real React/Svelte app:
[`docs/TESTING.md`](docs/TESTING.md).

## Using the widget in an app

```bash
npm install feedback-sdk-widget
```

The widget is a browser custom element (`class extends HTMLElement`). **Import it
on the client only** -- importing at module top level crashes any server-rendering
framework (Next.js, SvelteKit, Nuxt) because `HTMLElement` does not exist on the
server. Use the guarded pattern for your stack:

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
- theming: override `--fw-accent`, `--fw-surface`, `--fw-text`, `--fw-radius`, and friends
- fires `feedback-submitted` (`CustomEvent<{ id: string }>`) on success

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

## Development

```bash
npm install
npx convex dev --once   # generate the API / deploy locally
npm test                # 31 tests: service, client, widget
```

## Roadmap

- Done: widget published to npm; service deployable to a public cloud endpoint.
- CLI: `npx feedback-sdk init` to provision a project and print keys.
- MCP server so agents get `feedback_list` / `feedback_resolve` tools directly.
- Multi-tenant (accounts, dashboard) to open it beyond a single owner.
