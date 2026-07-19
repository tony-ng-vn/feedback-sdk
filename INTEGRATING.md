# Integrating an existing app with a running feedback-sdk service

This is for wiring an app you already have to a feedback-sdk service someone else (or a past you) already deployed.

**Do not clone this repository to integrate an app.**
The repo is only needed to run or modify the service itself.

## What you need from the service owner

One of:

- A **service URL** (`$SITE`, looks like `https://<name>.convex.site`) and a **submit token** (`fbk_...`) for your app's project, or
- The service URL and the **owner key** (if the owner set one up and gave you permission to provision your own project -- see below).

## 1. Get a submit token

If you were handed a `fbk_...` token directly, skip to step 2.
If you were given the owner key instead, mint your own project:

```bash
curl -s -X POST "$SITE/projects" \
  -H "Authorization: Bearer $OWNER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"my-app-name"}'
# -> { "projectId", "submitToken", "adminKey" }
```

`submitToken` goes in your app (below).
Keep `adminKey` in your terminal/agent only -- it can read and delete feedback, never ship it client-side.

## 2. Install and wire up the widget

```bash
npm install feedback-sdk-widget
```

Set two env vars in your app: `$SITE` and the submit token.
The widget is a browser custom element; it touches `HTMLElement` at import time, so a top-level import crashes any SSR framework (Next.js, SvelteKit, Nuxt) on the server.
Guard it with a client-only hook -- the SSR guard pattern:

```jsx
// React / Next.js: dynamic import inside a client-only hook, not top level.
import { useEffect } from "react";
export function Feedback({ endpoint, token }) {
  useEffect(() => { import("feedback-sdk-widget"); }, []);
  return <feedback-widget endpoint={endpoint} token={token} />;
}
```

SvelteKit: same idea inside `onMount` instead of `useEffect`.
Plain client-only apps (Vite/CRA, no SSR) can just `import "feedback-sdk-widget"` at the top -- no guard needed.

If your app is dark-themed, add `theme="dark"` (or `theme="auto"` to follow the user's OS) so the widget does not render as a light panel on your dark UI:
`<feedback-widget endpoint={endpoint} token={token} theme="dark" />`.

## 3. Verify it works

```bash
curl -s -X POST "$SITE/submit" \
  -H "Authorization: Bearer $SUBMIT_TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"integration check"}'
# -> { "id": "..." }
```

If you get an `{ id }` back, the wiring is correct.
Any other shape or an error means check `$SITE` and the token first.

## 4. The agent loop

Once feedback is flowing, read and resolve it with the admin key:

```bash
curl -s "$SITE/feedback" -H "Authorization: Bearer $ADMIN_KEY"

curl -s -X POST "$SITE/feedback/resolve" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"id":"<feedback id>","status":"done"}'
```

That's the whole loop: a user hits the button in your app, your agent reads the queue and fixes the top item.
