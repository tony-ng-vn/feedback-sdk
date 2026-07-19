#!/usr/bin/env node
// Process entry point: validate config, then hand off to the stdio transport.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./src/server.js";

const endpoint = process.env.FEEDBACK_ENDPOINT;
const adminKey = process.env.FEEDBACK_ADMIN_KEY;

if (!endpoint) {
  console.error("feedback-sdk-mcp: FEEDBACK_ENDPOINT is required (the feedback-sdk service site URL)");
  process.exit(1);
}
if (!adminKey) {
  console.error("feedback-sdk-mcp: FEEDBACK_ADMIN_KEY is required (the project's fba_ admin key)");
  process.exit(1);
}

const server = createServer({ endpoint, adminKey });
const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is the protocol channel; startup status goes to stderr.
console.error("feedback-sdk-mcp running on stdio");
