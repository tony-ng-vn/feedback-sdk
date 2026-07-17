# Testing the feedback SDK yourself

This walks you (or an agent you direct) through running the whole loop:
start the service, create a project, submit feedback from a real browser widget,
and read it back the way an agent would.

Current state: the service runs as a **local Convex deployment** (no account or
login needed). The widget is consumed via a **local build/tarball** because it is
not published to npm yet. Both are fine for testing; publishing is a later step.

## 0. Start the service (one terminal, leave running)

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
npx convex dev
```

Note the HTTP URL it uses: open `.env.local` and copy `CONVEX_SITE_URL`
(something like `http://127.0.0.1:3211`). Call it `$SITE` below.

## 1. Create a project (get your two keys)

In a second terminal:

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
npx convex run projects:create '{"slug":"myapp"}'
```

Copy the two values it prints:
- `submitToken` (`fbk_myapp_...`) -- public, goes in the widget/browser.
- `adminKey` (`fba_myapp_...`) -- secret, stays in your terminal/agent.

## 2. Sanity-check the service with curl (no browser)

```bash
SITE=http://127.0.0.1:3211        # your CONVEX_SITE_URL
SUBMIT=fbk_myapp_...              # your submit token
ADMIN=fba_myapp_...               # your admin key

# submit one
curl -s -X POST "$SITE/submit" \
  -H "Authorization: Bearer $SUBMIT" -H "Content-Type: application/json" \
  -d '{"message":"first test","category":"bug","pageContext":"/curl"}'

# read it back (this is the "agent reads feedback" path)
curl -s "$SITE/feedback" -H "Authorization: Bearer $ADMIN"
```

## 3. See the widget in a browser -- the standalone demo (fastest)

Build the widget once, then serve the repo and open the demo page:

```bash
cd /Users/minhthiennguyen/Desktop/feedback-sdk
npm run build --workspace feedback-sdk-widget
npx http-server -p 8080 .        # or: python3 -m http.server 8080
```

Open `http://localhost:8080/examples/demo.html`, paste your `$SITE` and submit
token, click **Mount**, then use the Feedback button (bottom-right). Each submit
logs its id on the page. Confirm it landed with the curl read from step 2.

(You can also prefill: `.../demo.html?endpoint=http://127.0.0.1:3211&token=fbk_myapp_...`)

## 4. See the widget inside a real app (Euno or tony-todo)

The integrations live on feature branches; the widget is installed from the
local tarball.

```bash
# build + pack the widget
cd /Users/minhthiennguyen/Desktop/feedback-sdk
npm run build --workspace feedback-sdk-widget
cd packages/widget && npm pack        # makes feedback-sdk-widget-0.0.0.tgz

# Euno (React), on branch feat/feedback-widget
cd /Users/minhthiennguyen/Desktop/Euno/euno-app
git checkout feat/feedback-widget
npm install /Users/minhthiennguyen/Desktop/feedback-sdk/packages/widget/feedback-sdk-widget-0.0.0.tgz
printf 'VITE_FEEDBACK_ENDPOINT=%s\nVITE_FEEDBACK_TOKEN=%s\n' "$SITE" "$SUBMIT" >> .env.local
npm run dev
# sign in, click Feedback, submit; then curl the /feedback read to confirm

# tony-todo (Svelte), on branch feat/feedback-sdk-widget -- same shape
cd /Users/minhthiennguyen/Desktop/tony-todo-app
git checkout feat/feedback-sdk-widget
npm install /Users/minhthiennguyen/Desktop/feedback-sdk/packages/widget/feedback-sdk-widget-0.0.0.tgz
printf 'VITE_FEEDBACK_ENDPOINT=%s\nVITE_FEEDBACK_TOKEN=%s\n' "$SITE" "$TODO_SUBMIT" >> .env.local
npm run dev
```

For tony-todo use a project of its own so its feedback stays separate:
`npx convex run projects:create '{"slug":"tony-todo"}'` and use that token.

## 5. The agent loop (what this is really for)

1. You hit something while using the app and submit feedback from the widget.
2. In your terminal you tell an agent: "read the feedback for `myapp` and work
   on the top item." The agent reads it with the admin key:

   ```bash
   curl -s "$SITE/feedback" -H "Authorization: Bearer $ADMIN"
   ```

   (A dedicated MCP server and CLI for this are the next plans; today the read is
   this one HTTP call, which an agent can run directly.)
3. The agent acts on the feedback, and can mark it handled:

   ```bash
   curl -s -X POST "$SITE/feedback/resolve" \
     -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
     -d '{"id":"<feedback id>","status":"done"}'
   ```

## Notes / current limits

- Local Convex deployment: data lives on your machine and the service must be
  running (`npx convex dev`) for the widget or curl to reach it.
- The widget is installed from a local tarball, so the app feature branches
  cannot be merged as-is until the widget is published to npm (then the dep
  becomes a normal version).
- Reads/resolves are one HTTP call each with the admin key; the MCP + CLI
  conveniences are Plan 4.
