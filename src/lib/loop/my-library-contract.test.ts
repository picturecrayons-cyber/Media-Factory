import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const profile = readFileSync(join(process.cwd(), "src/lib/loop/profile.ts"), "utf8");

function block(name: string) {
  const start = profile.indexOf(`export const ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = profile.indexOf("\n  });", start);
  assert.notEqual(end, -1, `${name} handler must close`);
  return profile.slice(start, end);
}

test("My Library requires authentication and scopes saved rows to the verified user", () => {
  const handler = block("getConsumerWatchlist");
  assert.match(handler, /\.middleware\(\[authMiddleware\]\)/);
  assert.match(handler, /from loop_watchlists/);
  assert.match(handler, /select title_id, created_at/);
  assert.match(handler, /where user_id = \$\{context\.userId\}/);
  assert.doesNotMatch(handler, /\bloop_watchlist\b/);
});

test("My Library resolves title metadata through the Bridge-authorized catalog", () => {
  const handler = block("getConsumerWatchlist");
  assert.match(handler, /from public_loop_catalog\(\) catalog/);
  assert.match(handler, /catalog\.id = any\(\$\{savedIds\}::text\[\]\)/);
  assert.match(handler, /catalog\.poster_available/);
  assert.match(handler, /catalog\.backdrop_available/);
  assert.match(handler, /posterPath: null/);
  assert.match(handler, /backdropPath: null/);
  assert.doesNotMatch(handler, /join\\s+loop_titles/i);
  assert.doesNotMatch(handler, /from\\s+loop_titles/i);
});

test("Watchlist add, remove, and membership use the canonical Production schema", () => {
  for (const name of ["toggleWatchlist", "isTitleInWatchlist"]) {
    const handler = block(name);
    assert.match(handler, /\.middleware\(\[authMiddleware\]\)/);
    assert.match(handler, /loop_watchlists/);
    assert.match(handler, /title_id/);
    assert.match(handler, /where user_id = \$\{context\.userId\}/);
    assert.doesNotMatch(handler, /\bloop_watchlist\b/);
  }
  const toggle = block("toggleWatchlist");
  assert.match(toggle, /insert into loop_watchlists \(user_id, title_id\)/);
  assert.match(toggle, /delete from loop_watchlists/);
  assert.match(toggle, /on conflict \(user_id, title_id\) do nothing/);
});

test("Watch progress uses title_id and always scopes writes and reads to the verified user", () => {
  const save = block("saveWatchProgress");
  const read = block("getWatchProgress");
  for (const handler of [save, read]) {
    assert.match(handler, /\.middleware\(\[authMiddleware\]\)/);
    assert.match(handler, /title_id/);
    assert.match(handler, /user_id = \$\{context\.userId\}/);
    assert.doesNotMatch(handler, /\bloop_title_id\b/);
  }
  assert.match(save, /on conflict \(user_id, title_id\) do update/);
  assert.match(read, /select title_id, position_seconds/);
});

test("My Library does not turn database failures into a successful empty state", () => {
  const handler = block("getConsumerWatchlist");
  assert.match(handler, /const savedRows = await sql/);
  assert.match(handler, /const catalogRows = await sql/);
  assert.doesNotMatch(handler, /\.catch\(\(\) => \(\{ items: \[\] \}\)\)/);
});
