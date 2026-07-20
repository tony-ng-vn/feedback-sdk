// Core CLI logic, kept process-free so it is fully unit-testable: no
// spawning, no real network, no real stdio. bin/feedback-sdk.js is the only
// place that touches process.argv, fetch, or process.stdout/stderr for real.

const DEFAULT_ENV_PREFIX = "VITE_";
const KNOWN_FLAGS = new Set(["--site", "--owner-key", "--slug", "--env-prefix"]);

const USAGE = `Usage: feedback-sdk init --site <url> --owner-key <key> --slug <name> [--env-prefix <PREFIX_>]

Provisions a new project against a running feedback-sdk service and prints
the env vars an integrating app needs, plus the admin key.

Options:
  --site <url>         Base URL of the feedback-sdk service (its .convex.site origin)
  --owner-key <key>     The service owner's FEEDBACK_OWNER_KEY
  --slug <name>         A unique, short identifier for the new project
  --env-prefix <PREFIX_> Prefix for the printed env var names (default: VITE_)

  -h, --help             Show this help
`;

// Hand-rolled parsing: the flag surface is tiny (--flag value pairs), so a
// dependency would cost more than it saves. Returns null on anything invalid
// so the caller can fall back to printing usage.
function parseInitFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!KNOWN_FLAGS.has(flag) || value === undefined) return null;
    flags[flag] = value;
  }

  const site = flags["--site"];
  const ownerKey = flags["--owner-key"];
  const slug = flags["--slug"];
  const envPrefix = flags["--env-prefix"] ?? DEFAULT_ENV_PREFIX;
  if (!site || !ownerKey || !slug) return null;

  try {
    new URL(site);
  } catch {
    return null;
  }

  return { site: site.replace(/\/+$/, ""), ownerKey, slug, envPrefix };
}

function successOutput({ site, slug, envPrefix, submitToken, adminKey }) {
  return [
    `Project "${slug}" provisioned.`,
    "",
    `${envPrefix}FEEDBACK_ENDPOINT=${site}`,
    `${envPrefix}FEEDBACK_TOKEN=${submitToken}`,
    "",
    "Admin key -- keep this in your terminal or agent config, never ship it client-side:",
    `  ${adminKey}`,
    "",
  ].join("\n");
}

async function readErrorMessage(response) {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // fall through to the status-only message below
  }
  return response.statusText || "request failed";
}

async function runInit(flags, { fetchImpl, stdout, stderr }) {
  const { site, ownerKey, slug, envPrefix } = flags;
  const url = `${site}/projects`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug }),
    });
  } catch {
    stderr.write(
      `Could not reach ${site}. Check the URL and your network connection.\n`,
    );
    return 1;
  }

  if (response.status === 200) {
    const { submitToken, adminKey } = await response.json();
    stdout.write(successOutput({ site, slug, envPrefix, submitToken, adminKey }));
    return 0;
  }

  if (response.status === 404) {
    stderr.write(
      "Provisioning is not enabled on this service.\n" +
        "Ask the project owner to run: npx convex env set FEEDBACK_OWNER_KEY <a-strong-secret>\n",
    );
    return 1;
  }

  if (response.status === 401) {
    stderr.write("Unauthorized: the owner key is wrong. Check --owner-key and try again.\n");
    return 1;
  }

  if (response.status === 409) {
    stderr.write(
      `A project with slug "${slug}" already exists. ` +
        "Pick a different --slug, or ask the owner for its existing token.\n",
    );
    return 1;
  }

  const message = await readErrorMessage(response);
  stderr.write(`Provisioning failed (${response.status}): ${message}\n`);
  return 1;
}

// Entry point: pure function of (args, io) -> exit code. The bin wrapper
// supplies real process.argv / fetch / stdout / stderr; tests supply fakes.
export async function run({ args, fetchImpl, stdout, stderr }) {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    stdout.write(USAGE);
    return 0;
  }

  const [command, ...rest] = args;
  if (command !== "init") {
    stderr.write(USAGE);
    return 1;
  }

  const flags = parseInitFlags(rest);
  if (flags === null) {
    stderr.write(USAGE);
    return 1;
  }

  return runInit(flags, { fetchImpl, stdout, stderr });
}
