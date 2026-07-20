#!/usr/bin/env node
// Thin IO wrapper: all the actual logic lives in src/cli.js so it can be
// unit-tested without spawning a process.
import { run } from "../src/cli.js";

const exitCode = await run({
  args: process.argv.slice(2),
  fetchImpl: fetch,
  stdout: process.stdout,
  stderr: process.stderr,
});
process.exit(exitCode);
