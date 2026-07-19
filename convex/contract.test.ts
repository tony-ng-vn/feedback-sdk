/// <reference types="vite/client" />
// Wire-contract tests. These pin the HTTP shapes that shipped widgets depend
// on. Apps embed a specific widget version and talk to the one shared service,
// so the service must keep accepting every payload shape ever shipped and keep
// returning the keys agents already read. If a change breaks one of these
// tests, it breaks integrated products in the wild: the fix is to make the
// change additive, not to update the test.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function project(t: ReturnType<typeof convexTest>, slug: string) {
  return await t.mutation(api.projects.create, { slug });
}

function submit(t: ReturnType<typeof convexTest>, token: string, body: unknown) {
  return t.fetch("/submit", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("contract: a v0.1-era submit payload (no screenshot) still succeeds", async () => {
  const t = convexTest(schema, modules);
  const p = await project(t, "app");
  // Exactly what widget 0.1.0 sends. This shape is frozen forever.
  const res = await submit(t, p.submitToken, {
    message: "old widget payload",
    category: "bug",
    pageContext: "/checkout",
  });
  expect(res.status).toBe(200);
});

test("contract: a minimal submit (message only) still succeeds", async () => {
  const t = convexTest(schema, modules);
  const p = await project(t, "app");
  const res = await submit(t, p.submitToken, { message: "bare minimum" });
  expect(res.status).toBe(200);
});

test("contract: submit responds with exactly { id }", async () => {
  const t = convexTest(schema, modules);
  const p = await project(t, "app");
  const res = await submit(t, p.submitToken, { message: "shape check" });
  const body = await res.json();
  expect(Object.keys(body)).toEqual(["id"]);
  expect(typeof body.id).toBe("string");
});

test("contract: /feedback rows keep every key agents already read", async () => {
  const t = convexTest(schema, modules);
  const p = await project(t, "app");
  await submit(t, p.submitToken, { message: "row shape" });
  const res = await t.fetch("/feedback", {
    headers: { Authorization: `Bearer ${p.adminKey}` },
  });
  const { feedback } = await res.json();
  // Keys may be ADDED over time; removing or renaming any of these breaks
  // agents that already parse them.
  const frozenKeys = [
    "_id",
    "category",
    "message",
    "pageContext",
    "metadata",
    "submitter",
    "status",
    "createdAt",
    "updatedAt",
    "screenshotUrl",
  ];
  expect(Object.keys(feedback[0])).toEqual(expect.arrayContaining(frozenKeys));
});

test("contract: resolve accepts { id, status } and responds { ok: true }", async () => {
  const t = convexTest(schema, modules);
  const p = await project(t, "app");
  const submitRes = await submit(t, p.submitToken, { message: "resolve me" });
  const { id } = (await submitRes.json()) as { id: Id<"feedback"> };
  const res = await t.fetch("/feedback/resolve", {
    method: "POST",
    headers: { Authorization: `Bearer ${p.adminKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "done" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("contract: every error is { error: string } with a 4xx status", async () => {
  const t = convexTest(schema, modules);
  const p = await project(t, "app");
  const cases = [
    await submit(t, "fbk_app_wrong", { message: "x" }), // bad token
    await submit(t, p.submitToken, { message: "" }), // empty message
    await t.fetch("/feedback", { headers: { Authorization: "Bearer nope" } }),
  ];
  for (const res of cases) {
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  }
});

test("contract: token prefixes fbk_/fba_ and bearer auth are stable", async () => {
  const t = convexTest(schema, modules);
  const p = await project(t, "app");
  // Shipped widgets carry fbk_ tokens; agent scripts carry fba_ keys. The
  // prefixes and the Authorization: Bearer scheme cannot change.
  expect(p.submitToken.startsWith("fbk_")).toBe(true);
  expect(p.adminKey.startsWith("fba_")).toBe(true);
});
