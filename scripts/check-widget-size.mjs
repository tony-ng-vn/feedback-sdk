// Fail if the widget bundle outgrows its budget. The widget is embedded in
// other people's apps, so its size is part of the public contract: someone who
// added a ~3 kB gzip widget should not silently end up shipping a much larger
// one. Raising a budget is allowed, but it must be a deliberate, reviewed edit
// here, not a side effect.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGETS = [
  { file: "packages/widget/dist/feedback-widget.js", maxGzipBytes: 5_000 },
  { file: "packages/widget/dist/feedback-widget.iife.js", maxGzipBytes: 1_500 },
];

let failed = false;
for (const { file, maxGzipBytes } of BUDGETS) {
  const gzipped = gzipSync(readFileSync(file)).length;
  const ok = gzipped <= maxGzipBytes;
  console.log(
    `${ok ? "ok " : "FAIL"} ${file}: ${gzipped} bytes gzip (budget ${maxGzipBytes})`,
  );
  if (!ok) failed = true;
}
if (failed) {
  console.error("Widget bundle exceeds its size budget.");
  process.exit(1);
}
