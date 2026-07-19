# feedback-sdk

A one-command provisioning CLI for [feedback-sdk](https://github.com/tony-ng-vn/feedback-sdk).

## Usage

```
npx feedback-sdk init --site <url> --owner-key <key> --slug <name> [--env-prefix <PREFIX_>]
```

- `--site` -- the running feedback-sdk service's base URL (its `.convex.site` origin)
- `--owner-key` -- the service owner's `FEEDBACK_OWNER_KEY`
- `--slug` -- a unique, short identifier for the new project
- `--env-prefix` -- prefix for the printed env var names (default `VITE_`)

The owner key comes from whoever runs the feedback-sdk service.
They set it with:

```
npx convex env set FEEDBACK_OWNER_KEY <a-strong-secret>
```

If it is unset, provisioning is disabled and `init` fails with a 404.

On success, `init` prints two ready-to-paste env lines and the new project's admin key on its own line, clearly labeled.
The admin key grants read/write access to that project's whole feedback queue -- keep it in your terminal or agent config, never ship it client-side.

This package is the CLI.
The embeddable feedback button lives in [`feedback-sdk-widget`](https://www.npmjs.com/package/feedback-sdk-widget).
