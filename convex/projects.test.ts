/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { sha256Hex } from "./keys";

const modules = import.meta.glob("./**/*.ts");

test("create mints a project, returns two tokens, stores only hashes", async () => {
  const t = convexTest(schema, modules);
  const res = await t.mutation(api.projects.create, { slug: "euno" });

  expect(res.submitToken).toMatch(/^fbk_euno_[0-9a-f]{48}$/);
  expect(res.adminKey).toMatch(/^fba_euno_[0-9a-f]{48}$/);

  const project = await t.run((ctx) => ctx.db.get(res.projectId));
  expect(project?.slug).toBe("euno");
  expect(project?.owner).toBeNull();
  expect(project?.submitTokenHash).toBe(await sha256Hex(res.submitToken));
  expect(project?.adminKeyHash).toBe(await sha256Hex(res.adminKey));
  // Plaintext tokens must never be persisted.
  expect(JSON.stringify(project)).not.toContain(res.submitToken);
});

test("create rejects a blank slug", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.projects.create, { slug: "  " })).rejects.toThrow(
    "Slug is required",
  );
});

test("create rejects a duplicate slug", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.projects.create, { slug: "euno" });
  await expect(
    t.mutation(api.projects.create, { slug: "euno" }),
  ).rejects.toThrow("Project already exists");
});
