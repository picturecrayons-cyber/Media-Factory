import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";

function harness(internalRole = "super_admin") {
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    queries.push(query);
    if (query.includes("group by kind")) {
      return [{ kind: "master", asset_count: 3, verified_count: 2, total_bytes: 4096 }];
    }
    if (query.includes("from bridge_assets a")) {
      return [{
        id: "asset-ref",
        title_name: "Test Film",
        kind: "master",
        content_type: "video/mp4",
        byte_size: 4096,
        created_at: new Date("2026-11-18T00:00:00.000Z"),
      }];
    }
    return [];
  };
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": {
      createServerFn: () => {
        const builder = {
          middleware: () => builder,
          handler: (handler: unknown) => handler,
        };
        return builder;
      },
    },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "./session": {
      requireVerifiedActor: async () => ({ userId: "operator", emailVerified: true, internalRole }),
    },
    "./guards": { assertNotDevUser: () => {} },
  };
  const source = readFileSync(new URL("./super-admin-storage.ts", import.meta.url), "utf8");
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
  return { handler: exports.listSuperAdminStorageOverview, queries };
}

const context = { userId: "operator" };

test("Super Admin storage overview is metadata-only and performs SELECTs only", async () => {
  const h = harness();
  const result = await h.handler({ context }) as {
    summary: Array<{ assetCount: number; verifiedCount: number; totalBytes: number }>;
    recentAssets: Array<{ reference: string; titleName: string | null; verified: boolean }>;
  };
  assert.equal(result.summary[0].assetCount, 3);
  assert.equal(result.summary[0].verifiedCount, 2);
  assert.equal(result.summary[0].totalBytes, 4096);
  assert.equal(result.recentAssets[0].reference, "asset-ref");
  assert.equal(result.recentAssets[0].verified, true);
  assert.equal(h.queries.length, 2);
  assert.ok(h.queries.every((query) => !/\b(insert|update|delete)\b/i.test(query)));
  assert.ok(h.queries.every((query) => !/s3_key|owner_user_id|created_by/i.test(query)));
});

test("non-Super Admin staff cannot read storage oversight", async () => {
  const h = harness("admin");
  await assert.rejects(h.handler({ context }), /Super Admin access required/);
  assert.equal(h.queries.length, 0);
});
