/// <reference types="vite/client" />
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

test("submit with a valid token stores feedback and returns its id", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await submit(t, euno.submitToken, {
    message: "search is broken",
    category: "bug",
    pageContext: "/search",
  });
  expect(res.status).toBe(200);
  const { id } = (await res.json()) as { id: Id<"feedback"> };
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.projectId).toBe(euno.projectId);
  expect(row?.message).toBe("search is broken");
});

test("submit rejects a bad token with 401", async () => {
  const t = convexTest(schema, modules);
  await project(t, "euno");
  const res = await submit(t, "fbk_euno_wrong", { message: "x" });
  expect(res.status).toBe(401);
});

test("submit rejects an empty message with 400", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await submit(t, euno.submitToken, { message: "   " });
  expect(res.status).toBe(400);
});

test("submit rejects an unknown category with 400", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await submit(t, euno.submitToken, {
    message: "hi", category: "spam",
  });
  expect(res.status).toBe(400);
});

test("GET /feedback returns only the caller's project rows", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const todo = await project(t, "todo");
  await submit(t, euno.submitToken, { message: "euno one" });
  await submit(t, todo.submitToken, { message: "todo one" });

  const res = await t.fetch("/feedback", {
    headers: { Authorization: `Bearer ${euno.adminKey}` },
  });
  expect(res.status).toBe(200);
  const { feedback } = await res.json();
  expect(feedback.map((r: { message: string }) => r.message)).toEqual([
    "euno one",
  ]);
});

test("GET /feedback rejects a submit token used as an admin key", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const res = await t.fetch("/feedback", {
    headers: { Authorization: `Bearer ${euno.submitToken}` },
  });
  expect(res.status).toBe(401);
});

test("resolve flips status and is rejected for another project", async () => {
  const t = convexTest(schema, modules);
  const euno = await project(t, "euno");
  const todo = await project(t, "todo");
  const submitRes = await submit(t, euno.submitToken, { message: "fix me" });
  const { id } = (await submitRes.json()) as { id: Id<"feedback"> };

  // Wrong project's admin key cannot resolve euno's row.
  const wrong = await t.fetch("/feedback/resolve", {
    method: "POST",
    headers: { Authorization: `Bearer ${todo.adminKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "done" }),
  });
  expect(wrong.status).toBe(404);

  const ok = await t.fetch("/feedback/resolve", {
    method: "POST",
    headers: { Authorization: `Bearer ${euno.adminKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "done" }),
  });
  expect(ok.status).toBe(200);
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.status).toBe("done");
});
