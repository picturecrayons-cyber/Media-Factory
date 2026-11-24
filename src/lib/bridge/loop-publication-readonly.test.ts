import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loop-publication.ts", import.meta.url), "utf8");
const start = source.indexOf("export const listLoopPublicationReadiness");
const end = source.indexOf("export const authorizeLoopPublication", start);

test("publication readiness GET handler contains no database mutations", () => {
  assert.notEqual(start, -1, "readiness handler must exist");
  assert.notEqual(end, -1, "next write handler must delimit readiness handler");
  const handler = source.slice(start, end);
  assert.doesNotMatch(
    handler,
    /\b(?:insert\s+into|update\s+[a-z_]+|delete\s+from|truncate\s+)\b/i,
    "GET readiness handler must remain read-only",
  );
  assert.match(handler, /\.handler\(async \(\{ context \}\) =>/);
  assert.match(handler, /select b\.id/);
});
