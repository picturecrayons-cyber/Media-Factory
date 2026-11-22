import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const profile = readFileSync(join(process.cwd(), "src/lib/loop/profile.ts"), "utf8");

test("My Library requires verified authentication and only queries the current user's saved rows", () => {
  const start = profile.indexOf("export const getConsumerWatchlist");
  assert.notEqual(start, -1);
  const end = profile.indexOf("\n  });", start);
  const handler = profile.slice(start, end);
  assert.match(handler, /\.middleware\(\[authMiddleware\]\)/);
  assert.match(handler, /from loop_watchlists/);
  assert.match(handler, /where user_id = \$\{context\.userId\}/);
  assert.doesNotMatch(handler, /from loop_watchlist\s/);
});

test("My Library resolves metadata through the publication-filtered consumer catalogue", () => {
  const start = profile.indexOf("export const getConsumerWatchlist");
  const end = profile.indexOf("\n  });", start);
  const handler = profile.slice(start, end);
  assert.match(handler, /from public_loop_catalog\(\)/);
  assert.match(handler, /l\.id::text = catalog\.id/);
  assert.match(handler, /any\(\$\{savedIds\}::uuid\[\]\)/);
  assert.doesNotMatch(handler, /join loop_titles l on l\.id = w\.loop_title_id/);
});

test("My Library does not turn a failed query into a successful empty result", () => {
  const start = profile.indexOf("export const getConsumerWatchlist");
  const end = profile.indexOf("\n  });", start);
  const handler = profile.slice(start, end);
  assert.match(handler, /const savedRows = await sql/);
  assert.match(handler, /const catalogRows = await sql/);
  assert.doesNotMatch(handler, /\.catch\(\(\) => \(\{ items: \[\] \}\)\)/);
});
