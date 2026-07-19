/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function provision(t: ReturnType<typeof convexTest>, key: string | null, body: unknown) {
  return t.fetch("/projects", {
    method: "POST",
    headers: {
      ...(key !== null ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("provisioning is disabled by default (unset owner key -> 404)", async () => {
  vi.stubEnv("FEEDBACK_OWNER_KEY", "");
  const t = convexTest(schema, modules);
  const res = await provision(t, "whatever", { slug: "myapp" });
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Provisioning is not enabled" });
});

test("wrong bearer key is rejected with 401", async () => {
  vi.stubEnv("FEEDBACK_OWNER_KEY", "supersecret");
  const t = convexTest(schema, modules);
  const res = await provision(t, "wrong-key", { slug: "myapp" });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Unauthorized" });
});

test("missing Authorization header is rejected with 401", async () => {
  vi.stubEnv("FEEDBACK_OWNER_KEY", "supersecret");
  const t = convexTest(schema, modules);
  const res = await provision(t, null, { slug: "myapp" });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Unauthorized" });
});

test("correct key and a new slug provisions a project and round-trips through submit", async () => {
  vi.stubEnv("FEEDBACK_OWNER_KEY", "supersecret");
  const t = convexTest(schema, modules);
  const res = await provision(t, "supersecret", { slug: "myapp" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    projectId: string;
    submitToken: string;
    adminKey: string;
  };
  expect(body.projectId).toBeTruthy();
  expect(body.submitToken).toMatch(/^fbk_myapp_[0-9a-f]{48}$/);
  expect(body.adminKey).toMatch(/^fba_myapp_[0-9a-f]{48}$/);

  // Round-trip proof: the minted submit token actually works against /submit.
  const submitRes = await t.fetch("/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${body.submitToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: "hello from a fresh project" }),
  });
  expect(submitRes.status).toBe(200);
  const { id } = (await submitRes.json()) as { id: string };
  expect(id).toBeTruthy();
});

test("correct key and a duplicate slug returns 409", async () => {
  vi.stubEnv("FEEDBACK_OWNER_KEY", "supersecret");
  const t = convexTest(schema, modules);
  await provision(t, "supersecret", { slug: "myapp" });
  const res = await provision(t, "supersecret", { slug: "myapp" });
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "Project already exists" });
});

test("correct key and an empty slug returns 400", async () => {
  vi.stubEnv("FEEDBACK_OWNER_KEY", "supersecret");
  const t = convexTest(schema, modules);
  const res = await provision(t, "supersecret", { slug: "   " });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "Slug is required" });
});

test("correct key and invalid JSON returns 400", async () => {
  vi.stubEnv("FEEDBACK_OWNER_KEY", "supersecret");
  const t = convexTest(schema, modules);
  const res = await t.fetch("/projects", {
    method: "POST",
    headers: { Authorization: "Bearer supersecret", "Content-Type": "application/json" },
    body: "{not json",
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "Invalid JSON" });
});
