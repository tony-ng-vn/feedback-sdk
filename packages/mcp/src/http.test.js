import { expect, test, vi } from "vitest";
import { listFeedback, resolveFeedback, deleteFeedback } from "./http.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ENDPOINT = "https://x.convex.site";
const ADMIN_KEY = "fba_euno_secret";

test("listFeedback GETs /feedback with the bearer admin key and no query when status is omitted", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ feedback: [] }));
  await listFeedback({ endpoint: ENDPOINT, adminKey: ADMIN_KEY, fetchImpl });

  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://x.convex.site/feedback");
  expect(init.method ?? "GET").toBe("GET");
  expect(init.headers.Authorization).toBe("Bearer fba_euno_secret");
});

test("listFeedback appends ?status= when a status filter is given", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ feedback: [] }));
  await listFeedback({
    endpoint: ENDPOINT,
    adminKey: ADMIN_KEY,
    status: "in_progress",
    fetchImpl,
  });

  const [url] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://x.convex.site/feedback?status=in_progress");
});

test("listFeedback returns the feedback rows on success", async () => {
  const rows = [{ _id: "fb_1", message: "hi", status: "new" }];
  const fetchImpl = vi.fn(async () => jsonResponse({ feedback: rows }));
  const result = await listFeedback({ endpoint: ENDPOINT, adminKey: ADMIN_KEY, fetchImpl });

  expect(result).toEqual({ ok: true, status: 200, data: { feedback: rows } });
});

test("resolveFeedback POSTs id and status to /feedback/resolve with the bearer admin key", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
  await resolveFeedback({
    endpoint: ENDPOINT,
    adminKey: ADMIN_KEY,
    id: "fb_1",
    status: "done",
    fetchImpl,
  });

  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://x.convex.site/feedback/resolve");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer fba_euno_secret");
  expect(init.headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(init.body)).toEqual({ id: "fb_1", status: "done" });
});

test("deleteFeedback POSTs id to /feedback/delete with the bearer admin key", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
  await deleteFeedback({ endpoint: ENDPOINT, adminKey: ADMIN_KEY, id: "fb_1", fetchImpl });

  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://x.convex.site/feedback/delete");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer fba_euno_secret");
  expect(JSON.parse(init.body)).toEqual({ id: "fb_1" });
});

test("a failed request surfaces the service's error message and status instead of throwing", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ error: "Unauthorized" }, 401));
  const result = await listFeedback({ endpoint: ENDPOINT, adminKey: "bad", fetchImpl });

  expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
});

test("a failed request with a non-JSON body still reports the status code", async () => {
  const fetchImpl = vi.fn(
    async () => new Response("boom", { status: 500 }),
  );
  const result = await deleteFeedback({
    endpoint: ENDPOINT,
    adminKey: ADMIN_KEY,
    id: "fb_1",
    fetchImpl,
  });

  expect(result).toEqual({ ok: false, status: 500, error: "Request failed (500)" });
});

test("resolve 404s (row missing or belongs to another project) surface as a normal error result", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ error: "Not found" }, 404));
  const result = await resolveFeedback({
    endpoint: ENDPOINT,
    adminKey: ADMIN_KEY,
    id: "fb_missing",
    status: "done",
    fetchImpl,
  });

  expect(result).toEqual({ ok: false, status: 404, error: "Not found" });
});
