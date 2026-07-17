import { expect, test } from "vitest";
import {
  TOKEN_PREFIXES,
  randomSecret,
  makeToken,
  parseToken,
  sha256Hex,
  bearerToken,
} from "./keys";

test("randomSecret returns 48 hex chars and differs each call", () => {
  const a = randomSecret();
  const b = randomSecret();
  expect(a).toMatch(/^[0-9a-f]{48}$/);
  expect(a).not.toBe(b);
});

test("makeToken/parseToken round-trip", () => {
  const token = makeToken(TOKEN_PREFIXES.submit, "euno", "deadbeef");
  expect(token).toBe("fbk_euno_deadbeef");
  expect(parseToken(token)).toEqual({
    prefix: "fbk",
    slug: "euno",
    secret: "deadbeef",
  });
});

test("parseToken returns null on malformed input", () => {
  expect(parseToken("nope")).toBeNull();
  expect(parseToken("fbk_euno")).toBeNull();
});

test("sha256Hex is stable and 64 hex chars", async () => {
  const h = await sha256Hex("fbk_euno_deadbeef");
  expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(await sha256Hex("fbk_euno_deadbeef")).toBe(h);
});

test("bearerToken extracts the token or null", () => {
  const withAuth = new Request("http://x/submit", {
    headers: { Authorization: "Bearer fbk_euno_deadbeef" },
  });
  expect(bearerToken(withAuth)).toBe("fbk_euno_deadbeef");
  expect(bearerToken(new Request("http://x/submit"))).toBeNull();
});
