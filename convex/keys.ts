// Pure, dependency-free helpers shared by functions and tests.
// Web Crypto (crypto.subtle, crypto.getRandomValues) is available in the
// Convex runtime and in the edge-runtime test environment.

export const TOKEN_PREFIXES = { submit: "fbk", admin: "fba" } as const;

export function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeToken(prefix: string, slug: string, secret: string): string {
  return `${prefix}_${slug}_${secret}`;
}

export function parseToken(
  token: string,
): { prefix: string; slug: string; secret: string } | null {
  const parts = token.split("_");
  if (parts.length !== 3) return null;
  const [prefix, slug, secret] = parts;
  if (!prefix || !slug || !secret) return null;
  return { prefix, slug, secret };
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}
