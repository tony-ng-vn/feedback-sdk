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
