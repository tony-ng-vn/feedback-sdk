import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { bearerToken, parseToken, sha256Hex, TOKEN_PREFIXES } from "./keys";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const CATEGORIES = ["idea", "bug", "other"];
const STATUSES = ["new", "in_progress", "done"];

// The widget runs on the host app's origin and calls this service cross-origin
// with an Authorization header, so browsers send a CORS preflight. Allow any
// origin: writes are gated by the submit token, reads by the admin key, not by
// origin. Tokens are the security boundary, so "*" is correct here.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Answer CORS preflight for every endpoint.
const preflight = httpAction(
  async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
);

// Resolve a bearer token of the expected kind to its project id, or null.
async function projectForToken(
  ctx: ActionCtx,
  request: Request,
  kind: "submit" | "admin",
): Promise<Id<"projects"> | null> {
  const token = bearerToken(request);
  if (token === null) return null;
  const parsed = parseToken(token);
  if (parsed === null || parsed.prefix !== TOKEN_PREFIXES[kind]) return null;
  const hash = await sha256Hex(token);
  return kind === "submit"
    ? await ctx.runQuery(internal.feedback.projectBySubmitHash, { hash })
    : await ctx.runQuery(internal.feedback.projectByAdminHash, { hash });
}

const submit = httpAction(async (ctx, request) => {
  const projectId = await projectForToken(ctx, request, "submit");
  if (projectId === null) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message === "") return json({ error: "Message is required" }, 400);

  const category = typeof body.category === "string" ? body.category : "idea";
  if (!CATEGORIES.includes(category)) {
    return json({ error: "Unknown category" }, 400);
  }

  const pageContext =
    typeof body.pageContext === "string" ? body.pageContext : null;
  const submitter = typeof body.submitter === "string" ? body.submitter : null;
  const metadata =
    body.metadata === undefined || body.metadata === null
      ? null
      : JSON.stringify(body.metadata);

  const id = await ctx.runMutation(internal.feedback.insert, {
    projectId,
    category,
    message,
    pageContext,
    metadata,
    submitter,
  });
  return json({ id }, 200);
});

const list = httpAction(async (ctx, request) => {
  const projectId = await projectForToken(ctx, request, "admin");
  if (projectId === null) return json({ error: "Unauthorized" }, 401);

  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  const feedback = await ctx.runQuery(internal.feedback.listByProject, {
    projectId,
    status,
  });
  return json({ feedback }, 200);
});

const resolve = httpAction(async (ctx, request) => {
  const projectId = await projectForToken(ctx, request, "admin");
  if (projectId === null) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (id === "" || !STATUSES.includes(status)) {
    return json({ error: "Invalid id or status" }, 400);
  }

  const ok = await ctx.runMutation(internal.feedback.setStatus, {
    projectId,
    id: id as Id<"feedback">,
    status,
  });
  if (!ok) return json({ error: "Not found" }, 404);
  return json({ ok: true }, 200);
});

const http = httpRouter();
http.route({ path: "/submit", method: "POST", handler: submit });
http.route({ path: "/submit", method: "OPTIONS", handler: preflight });
http.route({ path: "/feedback", method: "GET", handler: list });
http.route({ path: "/feedback", method: "OPTIONS", handler: preflight });
http.route({ path: "/feedback/resolve", method: "POST", handler: resolve });
http.route({ path: "/feedback/resolve", method: "OPTIONS", handler: preflight });

export default http;
