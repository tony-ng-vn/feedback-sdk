import { expect, test, vi } from "vitest";
import { run } from "./cli.js";

function fakeIo() {
  const stdout = { write: vi.fn() };
  const stderr = { write: vi.fn() };
  return {
    stdout,
    stderr,
    out: () => stdout.write.mock.calls.map((c) => c[0]).join(""),
    err: () => stderr.write.mock.calls.map((c) => c[0]).join(""),
  };
}

function okFetch(payload) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function errFetch(status, payload) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload ?? { error: "nope" }), { status }),
  );
}

const VALID_ARGS = [
  "init",
  "--site",
  "https://x.convex.site",
  "--owner-key",
  "owner-secret",
  "--slug",
  "myapp",
];

test("init calls POST <site>/projects with the owner key and slug", async () => {
  const fetchImpl = okFetch({
    projectId: "p1",
    submitToken: "fbk_myapp_abc",
    adminKey: "fba_myapp_xyz",
  });
  const io = fakeIo();

  const code = await run({ args: VALID_ARGS, fetchImpl, stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://x.convex.site/projects");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer owner-secret");
  expect(init.headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(init.body)).toEqual({ slug: "myapp" });
});

test("init strips a trailing slash from --site before building the URL", async () => {
  const fetchImpl = okFetch({ projectId: "p1", submitToken: "t", adminKey: "a" });
  const io = fakeIo();
  await run({
    args: [
      "init",
      "--site",
      "https://x.convex.site/",
      "--owner-key",
      "k",
      "--slug",
      "myapp",
    ],
    fetchImpl,
    stdout: io.stdout,
    stderr: io.stderr,
  });
  expect(fetchImpl.mock.calls[0][0]).toBe("https://x.convex.site/projects");
});

test("success output prints both env lines with the default VITE_ prefix", async () => {
  const fetchImpl = okFetch({
    projectId: "p1",
    submitToken: "fbk_myapp_abc",
    adminKey: "fba_myapp_xyz",
  });
  const io = fakeIo();

  const code = await run({ args: VALID_ARGS, fetchImpl, stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(0);
  const out = io.out();
  expect(out).toContain("VITE_FEEDBACK_ENDPOINT=https://x.convex.site");
  expect(out).toContain("VITE_FEEDBACK_TOKEN=fbk_myapp_abc");
  expect(out).toContain("fba_myapp_xyz");
  // The admin key must never be shipped client-side; the CLI should say so.
  expect(out.toLowerCase()).toContain("never");
  expect(out.toLowerCase()).toContain("client");
});

test("success output respects a custom --env-prefix", async () => {
  const fetchImpl = okFetch({ projectId: "p1", submitToken: "t", adminKey: "a" });
  const io = fakeIo();

  await run({
    args: [...VALID_ARGS, "--env-prefix", "REACT_APP_"],
    fetchImpl,
    stdout: io.stdout,
    stderr: io.stderr,
  });

  const out = io.out();
  expect(out).toContain("REACT_APP_FEEDBACK_ENDPOINT=https://x.convex.site");
  expect(out).toContain("REACT_APP_FEEDBACK_TOKEN=t");
  expect(out).not.toContain("VITE_FEEDBACK_ENDPOINT");
});

test("404 maps to a provisioning-not-enabled message and exit 1", async () => {
  const fetchImpl = errFetch(404, { error: "Provisioning is not enabled" });
  const io = fakeIo();

  const code = await run({ args: VALID_ARGS, fetchImpl, stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(1);
  const err = io.err();
  expect(err.toLowerCase()).toContain("provisioning");
  expect(err).toContain("FEEDBACK_OWNER_KEY");
  expect(io.out()).toBe("");
});

test("401 maps to a wrong-owner-key message and exit 1", async () => {
  const fetchImpl = errFetch(401, { error: "Unauthorized" });
  const io = fakeIo();

  const code = await run({ args: VALID_ARGS, fetchImpl, stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(1);
  const err = io.err().toLowerCase();
  expect(err).toContain("owner key");
});

test("409 maps to a slug-already-exists message and exit 1", async () => {
  const fetchImpl = errFetch(409, { error: "Project already exists" });
  const io = fakeIo();

  const code = await run({ args: VALID_ARGS, fetchImpl, stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(1);
  const err = io.err().toLowerCase();
  expect(err).toContain("already exists");
  expect(err).toContain("myapp");
});

test("network failure maps to a could-not-reach message and exit 1", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError("fetch failed");
  });
  const io = fakeIo();

  const code = await run({ args: VALID_ARGS, fetchImpl, stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(1);
  const err = io.err().toLowerCase();
  expect(err).toContain("could not reach");
  expect(err).toContain("x.convex.site");
});

test("an unexpected status code still exits 1 with the server's error message", async () => {
  const fetchImpl = errFetch(500, { error: "boom" });
  const io = fakeIo();

  const code = await run({ args: VALID_ARGS, fetchImpl, stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(1);
  expect(io.err()).toContain("boom");
});

test("no args prints usage to stdout and exits 0", async () => {
  const io = fakeIo();
  const code = await run({ args: [], fetchImpl: vi.fn(), stdout: io.stdout, stderr: io.stderr });

  expect(code).toBe(0);
  expect(io.out()).toContain("feedback-sdk init");
  expect(io.err()).toBe("");
});

test("--help prints usage to stdout and exits 0", async () => {
  const io = fakeIo();
  const code = await run({
    args: ["--help"],
    fetchImpl: vi.fn(),
    stdout: io.stdout,
    stderr: io.stderr,
  });

  expect(code).toBe(0);
  expect(io.out()).toContain("Usage");
});

test("an unknown command prints usage to stderr and exits 1", async () => {
  const io = fakeIo();
  const code = await run({
    args: ["bogus"],
    fetchImpl: vi.fn(),
    stdout: io.stdout,
    stderr: io.stderr,
  });

  expect(code).toBe(1);
  expect(io.err()).toContain("Usage");
  expect(io.out()).toBe("");
});

test("init missing --owner-key prints usage to stderr and exits 1", async () => {
  const io = fakeIo();
  const fetchImpl = vi.fn();
  const code = await run({
    args: ["init", "--site", "https://x.convex.site", "--slug", "myapp"],
    fetchImpl,
    stdout: io.stdout,
    stderr: io.stderr,
  });

  expect(code).toBe(1);
  expect(io.err()).toContain("Usage");
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("init missing --slug prints usage to stderr and exits 1", async () => {
  const io = fakeIo();
  const code = await run({
    args: ["init", "--site", "https://x.convex.site", "--owner-key", "k"],
    fetchImpl: vi.fn(),
    stdout: io.stdout,
    stderr: io.stderr,
  });

  expect(code).toBe(1);
  expect(io.err()).toContain("Usage");
});

test("init with an invalid --site URL prints usage to stderr and exits 1", async () => {
  const io = fakeIo();
  const code = await run({
    args: ["init", "--site", "not-a-url", "--owner-key", "k", "--slug", "myapp"],
    fetchImpl: vi.fn(),
    stdout: io.stdout,
    stderr: io.stderr,
  });

  expect(code).toBe(1);
  expect(io.err()).toContain("Usage");
});

test("init with a dangling flag (no value) prints usage to stderr and exits 1", async () => {
  const io = fakeIo();
  const code = await run({
    args: ["init", "--site", "https://x.convex.site", "--owner-key"],
    fetchImpl: vi.fn(),
    stdout: io.stdout,
    stderr: io.stderr,
  });

  expect(code).toBe(1);
  expect(io.err()).toContain("Usage");
});
