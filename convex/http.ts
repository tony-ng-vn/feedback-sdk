import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { bearerToken, parseToken, sha256Hex, TOKEN_PREFIXES } from "./keys";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Categories are host-defined: the widget's `categories` attribute is
// configurable, so the server accepts any short, non-empty label rather than a
// fixed enum (a fixed enum silently 400s custom categories -- a footgun).
const MAX_CATEGORY_LEN = 50;
const STATUSES = ["new", "in_progress", "done"];

// Attached screenshots arrive as a base64 image data URL. Cap the decoded size
// so a submit token (public, embeddable) can't be used to dump large blobs.
const MAX_SCREENSHOT_BYTES = 3_000_000; // 3 MB
const DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

type StoreResult =
  | { ok: true; storageId: Id<"_storage"> }
  | { ok: false; error: string };

// Validate an image data URL and put it in file storage. Rejects anything that
// is not an image or is over the size cap, so callers can turn it into a 400.
async function storeScreenshot(
  ctx: ActionCtx,
  value: string,
): Promise<StoreResult> {
  const match = DATA_URL.exec(value);
  if (match === null) {
    return { ok: false, error: "Screenshot must be a base64 image data URL" };
  }
  const [, mime, base64] = match;
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return { ok: false, error: "Screenshot is not valid base64" };
  }
  if (binary.length > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: "Screenshot is too large (max 3 MB)" };
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const storageId = await ctx.storage.store(new Blob([bytes], { type: mime }));
  return { ok: true, storageId };
}

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

  const rawCategory =
    typeof body.category === "string" ? body.category.trim() : "";
  const category = rawCategory === "" ? "idea" : rawCategory;
  if (category.length > MAX_CATEGORY_LEN) {
    return json({ error: "Category too long" }, 400);
  }

  const pageContext =
    typeof body.pageContext === "string" ? body.pageContext : null;
  const submitter = typeof body.submitter === "string" ? body.submitter : null;
  const metadata =
    body.metadata === undefined || body.metadata === null
      ? null
      : JSON.stringify(body.metadata);

  let screenshotStorageId: Id<"_storage"> | null = null;
  if (body.screenshot !== undefined && body.screenshot !== null) {
    if (typeof body.screenshot !== "string") {
      return json({ error: "Screenshot must be a string" }, 400);
    }
    const stored = await storeScreenshot(ctx, body.screenshot);
    if (!stored.ok) return json({ error: stored.error }, 400);
    screenshotStorageId = stored.storageId;
  }

  const id = await ctx.runMutation(internal.feedback.insert, {
    projectId,
    category,
    message,
    pageContext,
    metadata,
    submitter,
    screenshotStorageId,
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
  // Resolve each attached screenshot to a fetchable URL so an agent can pull
  // the image directly; rows without one report null.
  const withUrls = await Promise.all(
    feedback.map(async (row) => ({
      ...row,
      screenshotUrl: row.screenshotStorageId
        ? await ctx.storage.getUrl(row.screenshotStorageId)
        : null,
    })),
  );
  return json({ feedback: withUrls }, 200);
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

const del = httpAction(async (ctx, request) => {
  const projectId = await projectForToken(ctx, request, "admin");
  if (projectId === null) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (id === "") return json({ error: "Invalid id" }, 400);

  const ok = await ctx.runMutation(internal.feedback.remove, {
    projectId,
    id: id as Id<"feedback">,
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
http.route({ path: "/feedback/delete", method: "POST", handler: del });
http.route({ path: "/feedback/delete", method: "OPTIONS", handler: preflight });

export default http;
