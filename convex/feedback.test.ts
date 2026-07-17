/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function projectId(t: ReturnType<typeof convexTest>, slug: string) {
  const res = await t.mutation(api.projects.create, { slug });
  return res.projectId;
}

test("insert stores a new-status row with timestamps", async () => {
  const t = convexTest(schema, modules);
  const pid = await projectId(t, "euno");
  const id = await t.mutation(internal.feedback.insert, {
    projectId: pid,
    category: "bug",
    message: "search is broken",
    pageContext: "/search",
    metadata: null,
    submitter: null,
  });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.status).toBe("new");
  expect(row?.message).toBe("search is broken");
  expect(typeof row?.createdAt).toBe("number");
});

test("listByProject returns only that project's rows, newest first", async () => {
  const t = convexTest(schema, modules);
  const euno = await projectId(t, "euno");
  const todo = await projectId(t, "todo");
  await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "idea", message: "first",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "idea", message: "second",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.insert, {
    projectId: todo, category: "idea", message: "other project",
    pageContext: null, metadata: null, submitter: null,
  });

  const rows = await t.query(internal.feedback.listByProject, {
    projectId: euno,
  });
  expect(rows.map((r) => r.message)).toEqual(["second", "first"]);
});

test("listByProject filters by status when given", async () => {
  const t = convexTest(schema, modules);
  const euno = await projectId(t, "euno");
  const a = await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "bug", message: "a",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "bug", message: "b",
    pageContext: null, metadata: null, submitter: null,
  });
  await t.mutation(internal.feedback.setStatus, {
    projectId: euno, id: a, status: "done",
  });
  const open = await t.query(internal.feedback.listByProject, {
    projectId: euno, status: "new",
  });
  expect(open.map((r) => r.message)).toEqual(["b"]);
});

test("setStatus refuses a row from another project", async () => {
  const t = convexTest(schema, modules);
  const euno = await projectId(t, "euno");
  const todo = await projectId(t, "todo");
  const id = await t.mutation(internal.feedback.insert, {
    projectId: euno, category: "bug", message: "a",
    pageContext: null, metadata: null, submitter: null,
  });
  const ok = await t.mutation(internal.feedback.setStatus, {
    projectId: todo, id, status: "done",
  });
  expect(ok).toBe(false);
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.status).toBe("new");
});

test("projectBySubmitHash and projectByAdminHash resolve the right project", async () => {
  const t = convexTest(schema, modules);
  const res = await t.mutation(api.projects.create, { slug: "euno" });
  const project = await t.run((ctx) => ctx.db.get(res.projectId));
  const bySubmit = await t.query(internal.feedback.projectBySubmitHash, {
    hash: project!.submitTokenHash,
  });
  const byAdmin = await t.query(internal.feedback.projectByAdminHash, {
    hash: project!.adminKeyHash,
  });
  expect(bySubmit).toBe(res.projectId);
  expect(byAdmin).toBe(res.projectId);
  expect(
    await t.query(internal.feedback.projectBySubmitHash, { hash: "nope" }),
  ).toBeNull();
});
