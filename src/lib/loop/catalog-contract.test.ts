import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { z } from "zod";

// Run the real server handler with isolated SQL/auth dependencies. No external DB calls.
function harness(options = {}) {
  const queries = [];
  const sql = async (strings, ..._values) => {
    const query = strings.join("?");
    queries.push(query);
    if (query.includes("select l.id, l.access_tier")) return options.titleRows ?? [];
    if (query.includes("from loop_user_tvod_entitlements")) return options.entitlementRows ?? [];
    if (query.includes("from loop_subscriptions")) return [];
    return [];
  };
  const modules = {
    "@tanstack/react-start": {
      createServerFn: () => {
        const builder = {
          middleware: () => builder,
          validator: () => builder,
          handler: (handler) => handler,
        };
        return builder;
      },
    },
    zod: { z },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
  };
  const source = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");
  const output = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(output, {
    exports,
    require: (name) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return { check: exports.checkPlaybackEntitlement, queries };
}

test("unpublished/revoked/out-of-window titles fail closed before FREE playback", async () => {
  const h = harness({ titleRows: [] });
  const result = await h.check({ context: { userId: "user-1" }, data: { loopTitleId: "title-1" } });
  assert.equal(result.canPlay, false);
  assert.match(h.queries[0], /l\.status = 'approved'/);
  assert.match(h.queries[0], /l\.listed = true/);
  assert.match(h.queries[0], /l\.published = true/);
  assert.match(h.queries[0], /p\.authorization_status = 'authorized'/);
  assert.match(h.queries[0], /p\.revoked_at is null/);
  assert.match(h.queries[0], /p\.window_start is null or p\.window_start <= now\(\)/);
  assert.match(h.queries[0], /p\.window_end is null or p\.window_end >= now\(\)/);
});

test("active TVOD entitlement from canonical table grants playback", async () => {
  const h = harness({
    titleRows: [{ id: "title-1", access_tier: "TVOD" }],
    entitlementRows: [{ id: "entitlement-1", access_type: "TVOD_RENTAL", expires_at: null }],
  });
  const result = await h.check({ context: { userId: "user-1" }, data: { loopTitleId: "title-1" } });
  assert.equal(result.canPlay, true);
  assert.equal(result.accessType, "TVOD_RENTAL");
  const query = h.queries.find((item) => item.includes("from loop_user_tvod_entitlements"));
  assert.ok(query);
  assert.match(query, /title_id = \?/);
  assert.match(query, /status = 'ACTIVE'/);
  assert.match(query, /expires_at > now\(\)/);
  assert.match(query, /order by purchased_at desc/);
});

test("expired or absent TVOD entitlement denies playback", async () => {
  const h = harness({ titleRows: [{ id: "title-1", access_tier: "TVOD" }], entitlementRows: [] });
  const result = await h.check({ context: { userId: "user-1" }, data: { loopTitleId: "title-1" } });
  assert.equal(result.canPlay, false);
  assert.ok(h.queries.some((query) => query.includes("from loop_user_tvod_entitlements")));
});
