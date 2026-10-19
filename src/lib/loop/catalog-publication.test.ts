import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { z } from "zod";

function harness(activePublication: boolean) {
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const query = strings.join("?");
    queries.push(query);
    if (query.includes("from loop_titles l") && query.includes("join bridge_loop_publications p")) {
      return activePublication ? [{ id: "loop-1", access_tier: "FREE" }] : [];
    }
    return [];
  };
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": {
      createServerFn: () => {
        const builder = {
          middleware: () => builder,
          validator: () => builder,
          handler: (handler: unknown) => handler,
        };
        return builder;
      },
    },
    zod: { z },
    "@/lib/db": { getSql: async () => sql },
    "@/lib/auth/middleware": { authMiddleware: {} },
  };
  const source = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");
  const output = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, (args: unknown) => Promise<unknown>> = {};
  runInNewContext(output, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return { entitlement: exports.checkPlaybackEntitlement, queries };
}

test("FREE access is denied when Bridge publication or its active license is missing", async () => {
  const h = harness(false);
  const result = await h.entitlement({ context: { userId: "consumer" }, data: { loopTitleId: "loop-1" } });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    loopTitleId: "loop-1",
    accessType: "FREE",
    expiresAt: null,
    canPlay: false,
  });
  assert.match(h.queries[0], /p\.authorization_status = 'authorized'/);
  assert.match(h.queries[0], /l\.listed = true/);
  assert.match(h.queries[0], /l\.published = true/);
  assert.match(h.queries[0], /p\.window_start is not null/);
  assert.match(h.queries[0], /p\.window_end is not null/);
  assert.match(h.queries[0], /g\.status = 'VALID'/);
});

test("FREE access is granted only after the active publication query returns the title", async () => {
  const h = harness(true);
  const result = await h.entitlement({ context: { userId: "consumer" }, data: { loopTitleId: "loop-1" } });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    loopTitleId: "loop-1",
    accessType: "FREE",
    expiresAt: null,
    canPlay: true,
  });
});

test("public catalog, title details, related titles, and playback entitlement all require a bounded active window", () => {
  const source = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");
  assert.equal((source.match(/p\.window_start is not null/g) || []).length, 4);
  assert.equal((source.match(/p\.window_end is not null/g) || []).length, 4);
  assert.equal((source.match(/join bridge_rights_grants g/g) || []).length, 4);
});
