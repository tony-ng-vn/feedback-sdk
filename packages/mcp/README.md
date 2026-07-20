# feedback-sdk-mcp

An MCP server that puts a feedback-sdk project's queue directly in an agent's toolset.
Instead of an agent shelling out to `curl` with a bearer key, it gets three first-class tools for reading and triaging feedback.

## Configuration

The server reads its config from environment variables and fails fast with a one-line error on stderr if either is missing:

- `FEEDBACK_ENDPOINT` -- the feedback-sdk service's site URL (looks like `https://<name>.convex.site`).
- `FEEDBACK_ADMIN_KEY` -- the project's admin key (`fba_...`).
  Get this from whoever provisioned the project; see the repo's `INTEGRATING.md`.

## Registering it in an MCP client

Add an entry to your client's `mcpServers` config:

```json
{
  "mcpServers": {
    "feedback-sdk": {
      "command": "npx",
      "args": ["-y", "feedback-sdk-mcp"],
      "env": {
        "FEEDBACK_ENDPOINT": "https://<name>.convex.site",
        "FEEDBACK_ADMIN_KEY": "fba_..."
      }
    }
  }
}
```

## Tools

- `feedback_list` -- read the feedback queue, newest first; optionally filter by status (`new`, `in_progress`, `done`).
- `feedback_resolve` -- set the status of one feedback item.
- `feedback_delete` -- permanently delete one feedback item.
