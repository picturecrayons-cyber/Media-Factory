import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { z } from "zod";
import * as rights from "./rights-coverage.ts";

// Execute the real server handler with isolated transport/database dependencies.
// No database or AWS requests are made by this harness.
function harness(grants: unknown[], allowed = true, existing = false) {
  const writes: { query: string; values: unknown[] }[] = [];
  const title = {
    id: "title-1",
    slug: "film",
    name: "Film",
    status: "LICENSED",
    language: "Malayalam",
    master_key: "sealed/master",
    poster_key: "sealed/poster",
  };
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?");
    if (query.includes("from bridge_titles")) return [title];
    if (query.includes("select evidence from bridge_rights_grants"))
      return [
        { evidence: [{ commercialTerms: { rightsOwnerSharePct: 80, distributorSharePct: 20 } }] },
      ];
    if (query.includes("from bridge_rights_grants")) return grants;
    if (query.includes("as qc_ok")) return [{ qc_ok: true, legal_ok: true }];
    if (query.includes("select id from bridge_titles")) return [title];
    if (query.includes("select id from loop_titles"))
      return existing ? [{ id: "loop-existing" }] : [];
    writes.push({ query, values });
    return [];
  };
  Object.assign(sql, { transaction: async (fn: (tx: typeof sql) => Promise<unknown>) => fn(sql) });
  const modules: Record<string, unknown> = {
    "node:crypto": { randomUUID: () => "generated-id" },
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
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "./rbac": { assertPermission: () => { if (!allowed) throw new Error("Forbidden"); } },
    "./session": { requireVerifiedActor: async () => ({ userId: "operator", emailVerified: true }) },
    "./guards": { assertNotDevUser: () => {} },
    "./audit": { writeAudit: async () => {} },
    "./rights-coverage": rights,
  };
  const source = readFileSync(new URL("./loop-publication.ts", import.meta.url), "utf8");
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
  return { authorize: exports.authorizeLoopPublication, writes };
}

const grant = {
  id: "grant-1",
  status: "VALID",
  territories: ["WORLDWIDE"],
  languages: ["Malayalam"],
  media: ["OTT", "TVOD"],
  window_start: null,
  window_end: null,
  exclusivity: "NON_EXCLUSIVE",
};
const data = {
  bridgeTitleId: "title-1",
  destination: "CRAYONS_LOOP",
  territories: ["WORLDWIDE"],
  languages: ["Malayalam"],
  exploitationModels: ["TVOD"],
  accessTier: "TVOD",
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2099-01-01T00:00:00.000Z",
};
const context = { userId: "operator" };

test("new and existing publications emit the status accepted by the Loop catalog", async () => {
  for (const existing of [false, true]) {
    const h = harness([grant], true, existing);
    const result = await h.authorize({ context, data });
    assert.equal((result as { status: string }).status, "AUTHORIZED");
    const publication = h.writes.find((write) =>
      write.query.includes("insert into bridge_loop_publications"),
    );
    assert.ok(publication);
    assert.equal(publication.values[3], "authorized");
    assert.match(publication.query, /authorization_status = 'authorized'/);
    assert.ok(publication.values.includes(data.territories));
    assert.ok(publication.values.includes(data.windowEnd));
  }
});

test("status alignment never bypasses operator, rights or commercial coverage", async () => {
  for (const scenario of [
    { grants: [], allowed: true, data },
    { grants: [{ ...grant, status: "REVOKED" }], allowed: true, data },
    { grants: [{ ...grant, territories: ["US"] }], allowed: true, data },
    { grants: [grant], allowed: false, data },
    { grants: [grant], allowed: true, data: { ...data, accessTier: "SVOD" } },
  ]) {
    const h = harness(scenario.grants, scenario.allowed);
    await assert.rejects(h.authorize({ context, data: scenario.data }));
    assert.equal(h.writes.length, 0);
  }
});
