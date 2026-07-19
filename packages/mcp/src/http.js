// Thin HTTP core for the feedback-sdk service's admin routes (see convex/http.ts).
// Kept separate from the MCP server/transport so it is unit-testable with a
// fake fetch, mirroring packages/client/src/index.ts's fetchImpl pattern.

async function toResult(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error bodies still need a status-code fallback below.
  }
  if (!response.ok) {
    const error =
      body && typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
    return { ok: false, status: response.status, error };
  }
  return { ok: true, status: response.status, data: body };
}

function authHeaders(adminKey, withJsonBody) {
  const headers = { Authorization: `Bearer ${adminKey}` };
  if (withJsonBody) headers["Content-Type"] = "application/json";
  return headers;
}

// GET /feedback[?status=]. Newest-first rows with message, category, status,
// pageContext, screenshotUrl, createdAt, _id.
export async function listFeedback({ endpoint, adminKey, status, fetchImpl }) {
  const doFetch = fetchImpl ?? fetch;
  const url = new URL(`${endpoint}/feedback`);
  if (status !== undefined) url.searchParams.set("status", status);
  const response = await doFetch(url.toString(), {
    headers: authHeaders(adminKey, false),
  });
  return toResult(response);
}

// POST /feedback/resolve { id, status }.
export async function resolveFeedback({ endpoint, adminKey, id, status, fetchImpl }) {
  const doFetch = fetchImpl ?? fetch;
  const response = await doFetch(`${endpoint}/feedback/resolve`, {
    method: "POST",
    headers: authHeaders(adminKey, true),
    body: JSON.stringify({ id, status }),
  });
  return toResult(response);
}

// POST /feedback/delete { id }.
export async function deleteFeedback({ endpoint, adminKey, id, fetchImpl }) {
  const doFetch = fetchImpl ?? fetch;
  const response = await doFetch(`${endpoint}/feedback/delete`, {
    method: "POST",
    headers: authHeaders(adminKey, true),
    body: JSON.stringify({ id }),
  });
  return toResult(response);
}
