// Tool registration/wiring. Thin by design -- the HTTP logic it calls into
// lives in ./http.js where it can be unit-tested without a transport.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { listFeedback, resolveFeedback, deleteFeedback } from "./http.js";

const STATUS = ["new", "in_progress", "done"];

// Turns an http.js result into an MCP tool result: isError:true (never a
// thrown exception) surfaces the service's own { error } message and status.
function toToolResult(result, formatSuccess) {
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `${result.error} (HTTP ${result.status})` }],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: formatSuccess(result.data) }] };
}

export function createServer({ endpoint, adminKey, fetchImpl }) {
  const server = new McpServer({ name: "feedback-sdk-mcp", version: "0.1.0" });

  server.registerTool(
    "feedback_list",
    {
      description:
        "Read the feedback queue for this project, newest first. Optionally filter by " +
        "status (new, in_progress, done). Each row's id field is called _id.",
      inputSchema: {
        status: z
          .enum(STATUS)
          .optional()
          .describe("Only return rows with this status"),
      },
    },
    async ({ status }) => {
      const result = await listFeedback({ endpoint, adminKey, status, fetchImpl });
      return toToolResult(result, (data) => JSON.stringify(data.feedback, null, 2));
    },
  );

  server.registerTool(
    "feedback_resolve",
    {
      description:
        "Set the status of one feedback item, e.g. after triaging or fixing it. " +
        "id is the row's _id field from feedback_list.",
      inputSchema: {
        id: z.string().describe("The feedback row's _id"),
        status: z.enum(STATUS).describe("The new status"),
      },
    },
    async ({ id, status }) => {
      const result = await resolveFeedback({ endpoint, adminKey, id, status, fetchImpl });
      return toToolResult(result, () => `Feedback ${id} marked ${status}.`);
    },
  );

  server.registerTool(
    "feedback_delete",
    {
      description:
        "Permanently delete one feedback item, e.g. spam or a duplicate. " +
        "id is the row's _id field from feedback_list.",
      inputSchema: {
        id: z.string().describe("The feedback row's _id"),
      },
    },
    async ({ id }) => {
      const result = await deleteFeedback({ endpoint, adminKey, id, fetchImpl });
      return toToolResult(result, () => `Feedback ${id} deleted.`);
    },
  );

  return server;
}
