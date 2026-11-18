import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./loop-publication.ts", import.meta.url), "utf8");
const start = source.indexOf("export const listLoopPublicationReadiness");
const end = source.indexOf("\nexport const authorizeLoopPublication", start);

test("Loop publication readiness GET is strictly read-only", () => {
  assert.notEqual(start, -1, "readiness server function must exist");
  assert.notEqual(end, -1, "readiness function must end before publication authorization");
  const readiness = source.slice(start, end);

  assert.match(readiness, /createServerFn\(\{ method: "GET" \}\)/);
  assert.doesNotMatch(readiness, /\.catch\(\(\) => \{\}\)/);

  const statements = [...readiness.matchAll(/\bsql\s*\x60([\s\S]*?)\x60/g)].map((match) =>
    match[1].trim(),
  );
  assert.ok(statements.length > 0, "readiness must retain its database reads");
  for (const statement of statements) {
    assert.match(statement, /^select\b/i, "every SQL statement in the GET handler must be SELECT-only");
    assert.doesNotMatch(statement, /\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke)\b/i);
  }
});
