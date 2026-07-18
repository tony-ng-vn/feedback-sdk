import { expect, test, vi } from "vitest";
import { submitFeedback } from "./index";

function okFetch(payload: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

test("submitFeedback posts to /submit with the bearer token and body", async () => {
  const fetchImpl = okFetch({ id: "fb_1" });
  const result = await submitFeedback({
    endpoint: "https://x.convex.site",
    token: "fbk_euno_secret",
    message: "search broke",
    category: "bug",
    pageContext: "/search",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(result).toEqual({ id: "fb_1" });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://x.convex.site/submit");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer fbk_euno_secret");
  expect(JSON.parse(init.body)).toEqual({
    message: "search broke",
    category: "bug",
    pageContext: "/search",
  });
});

test("submitFeedback includes a screenshot data url when provided", async () => {
  const fetchImpl = okFetch({ id: "fb_1" });
  await submitFeedback({
    endpoint: "https://x.convex.site",
    token: "fbk_euno_secret",
    message: "look at this",
    screenshot: "data:image/png;base64,AAAA",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const [, init] = fetchImpl.mock.calls[0];
  expect(JSON.parse(init.body).screenshot).toBe("data:image/png;base64,AAAA");
});

test("submitFeedback omits the screenshot key when not provided", async () => {
  const fetchImpl = okFetch({ id: "fb_1" });
  await submitFeedback({
    endpoint: "https://x.convex.site",
    token: "fbk_euno_secret",
    message: "no shot",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const [, init] = fetchImpl.mock.calls[0];
  expect("screenshot" in JSON.parse(init.body)).toBe(false);
});

test("contract: the client only sends keys the service is committed to accept", async () => {
  const fetchImpl = okFetch({ id: "fb_1" });
  await submitFeedback({
    endpoint: "https://x.convex.site",
    token: "fbk_euno_secret",
    message: "everything set",
    category: "bug",
    pageContext: "/p",
    metadata: { a: 1 },
    submitter: "u@x.io",
    screenshot: "data:image/png;base64,AAAA",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const [, init] = fetchImpl.mock.calls[0];
  // The service accepts these keys forever; a rename here silently breaks
  // every app pinned to an older service expectation. Additions require a
  // matching (optional, additive) service change first.
  const frozenKeys = [
    "message",
    "category",
    "pageContext",
    "metadata",
    "submitter",
    "screenshot",
  ];
  for (const key of Object.keys(JSON.parse(init.body))) {
    expect(frozenKeys).toContain(key);
  }
});

test("submitFeedback throws the server error message on failure", async () => {
  const fetchImpl = vi.fn(async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  );
  await expect(
    submitFeedback({
      endpoint: "https://x.convex.site",
      token: "bad",
      message: "hi",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow("Unauthorized");
});
