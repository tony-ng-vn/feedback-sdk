# Testing the feedback SDK

This walks you (or an agent you direct) through the whole loop: point the widget
at a running service, submit feedback from a browser, and read it back the way an
agent would.

The widget is published on npm as
[`feedback-sdk-widget`](https://www.npmjs.com/package/feedback-sdk-widget), so no
build or tarball is needed to consume it. The service runs either as a local
Convex deployment (offline dev) or a cloud deployment (a public URL). You need
two things to test: a **service URL** and a project's **tokens**.

## Get a service URL

Pick one:

- **Cloud (public URL, always on).** If you were given a `https://<name>.convex.site`
  URL, use it as `$SITE`. Nothing to run.
- **Local.** From a clone of this repo: `npx convex dev` (leave running), then copy
  `CONVEX_SITE_URL` from `.env.local` -- something like `http://127.0.0.1:3211`.

## Get tokens

Each project has a public **submit token** (`fbk_...`, goes in the widget) and a
secret **admin key** (`fba_...`, for reading). To mint a project you need access
to the deployment (a local clone, or a deploy key). Against a configured
deployment:

```bash
npx convex run projects:create '{"slug":"myapp"}'
# prints { submitToken, adminKey }
```

If you were handed tokens directly, skip this.

## 1. Sanity-check with curl (no browser)

```bash
SITE=...            # your service URL
SUBMIT=fbk_...      # submit token
ADMIN=fba_...       # admin key

curl -s -X POST "$SITE/submit" \
  -H "Authorization: Bearer $SUBMIT" -H "Content-Type: application/json" \
  -d '{"message":"first test","category":"bug","pageContext":"/curl"}'

curl -s "$SITE/feedback" -H "Authorization: Bearer $ADMIN"   # the agent read path
```

## 2. Try the real widget in a browser (fastest: one HTML file)

The widget loads straight from a CDN (it's on npm), so a single file is enough:

```html
<!doctype html>
<script type="module">import "https://esm.sh/feedback-sdk-widget";</script>
<feedback-widget endpoint="PASTE_SITE" token="PASTE_SUBMIT_TOKEN"></feedback-widget>
```

Serve it (`npx http-server -p 8080 .`) or open it directly, then use the Feedback
button (bottom-right). Confirm submissions with the curl read from step 1.

This repo also has `examples/demo.html` (loads the local build and has inputs for
endpoint/token) if you prefer.

## 3. Use it inside a real app

```bash
npm install feedback-sdk-widget
```

React (JSX):

```tsx
import "feedback-sdk-widget";
// <feedback-widget endpoint={SITE} token={SUBMIT_TOKEN} />
```

Svelte / SSR frameworks: import the widget on the client only (it defines a
browser custom element, so importing it during server-side rendering will throw).
For example, import it inside `onMount`, or guard with `if (browser)`.

## 4. The agent loop (what this is for)

1. Submit feedback from the widget while using the app.
2. Tell an agent "read the feedback for `myapp` and fix the top item." It reads
   with the admin key:

   ```bash
   curl -s "$SITE/feedback" -H "Authorization: Bearer $ADMIN"
   ```

3. The agent acts, then marks the item handled:

   ```bash
   curl -s -X POST "$SITE/feedback/resolve" \
     -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
     -d '{"id":"<feedback id>","status":"done"}'
   ```

## Notes

- A **cloud** deployment is reachable from anywhere, 24/7 -- nothing needs to run
  locally. A **local** deployment only works while `npx convex dev` is running on
  your machine.
- Reads and resolves are one HTTP call each with the admin key. A dedicated CLI
  and MCP server for agents are on the roadmap.
- The submit token is safe to ship in app code; the admin key is not -- keep it in
  your terminal/agent environment.
