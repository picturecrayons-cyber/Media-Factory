import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/bridge/loop-publication.ts", import.meta.url), "utf8");
const start = source.indexOf("export const listLoopPublicationReadiness");
const end = source.indexOf("export const authorizeLoopPublication", start);

describe("Loop publication readiness GET remains read-only", () => {
  it("contains no database writes or swallowed database errors", () => {
    assert.notEqual(start, -1, "readiness GET handler must exist");
    assert.notEqual(end, -1, "readiness GET handler boundary must exist");
    const handler = source.slice(start, end);
    assert.doesNotMatch(handler, /\b(insert\s+into|update\s+[a-z_]+|delete\s+from)\b/i);
    assert.doesNotMatch(handler, /\.catch\s*\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
  });
});
