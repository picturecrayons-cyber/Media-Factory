import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { z } from "zod";
import * as rights from "./rights-coverage.ts";

// Execute the real server handler with isolated transport/database dependencies.
// No database or AWS requests are made by this harness.
function harness(
  grants: unknown[],
  allowed = true,
  existing = false,
  gates = {
    ott_preparation_status: "READY",
    packaging_status: "COMPLETE",
    curation_status: "APPROVED",
    delivery_status: "READY",
  },
  packageRow: any = {
    id: "package-1",
    rights_grant_id: "grant-1",
    qc_case_id: "qc-1",
    legal_case_id: "legal-1",
    asset_version_ids: ["00000000-0000-4000-8000-000000000001"],
    readiness_state: "READY",
  },
  renditionRow: any = {
    id: "00000000-0000-4000-8000-000000000001",
    s3_key: "deliverables/loop/hls/master.m3u8",
    checksum_sha256: "a".repeat(64),
    byte_size: 1024,
  },
) {
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
    if (query.includes("as qc_ok")) return [{
      qc_ok: true, legal_ok: true, qc_case_id: "qc-1", legal_case_id: "legal-1",
    }];
    if (query.includes("from bridge_title_gate_certifications")) return [gates];
    if (query.includes("from bridge_destination_packages")) return packageRow ? [packageRow] : [];
    if (query.includes("from bridge_asset_versions")) return renditionRow ? [renditionRow] : [];
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
    "@/lib/bridge/loop-lanes": {
      loopStageType: (raw: string | null | undefined) =>
        (raw || "").toLowerCase().includes("series") ? "Series" : "Film",
    },
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
    const loopTitle = h.writes.find((write) => write.query.includes("insert into loop_titles"));
    assert.ok(loopTitle);
    assert.equal(loopTitle.values[10], "deliverables/loop/hls/master.m3u8");
    assert.notEqual(loopTitle.values[10], "sealed/master");
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


test("publication requires all four release certifications", async () => {
  const incompleteGateSets = [
    { ott_preparation_status: "PENDING", packaging_status: "COMPLETE", curation_status: "APPROVED", delivery_status: "READY" },
    { ott_preparation_status: "READY", packaging_status: "PENDING", curation_status: "APPROVED", delivery_status: "READY" },
    { ott_preparation_status: "READY", packaging_status: "COMPLETE", curation_status: "PENDING", delivery_status: "READY" },
    { ott_preparation_status: "READY", packaging_status: "COMPLETE", curation_status: "APPROVED", delivery_status: "PENDING" },
  ];
  for (const gates of incompleteGateSets) {
    const h = harness([grant], true, false, gates);
    await assert.rejects(h.authorize({ context, data }), /Distribution Authorization Blocked/);
    assert.equal(h.writes.length, 0);
  }
});

test("publication accepts a rights-covered India-only territory without widening it to worldwide", async () => {
  const indiaGrant = { ...grant, territories: ["IN"] };
  const indiaData = { ...data, territories: ["IN"] };
  const h = harness([indiaGrant]);
  const result = await h.authorize({ context, data: indiaData });
  assert.equal((result as { status: string }).status, "AUTHORIZED");
  const publication = h.writes.find((write) => write.query.includes("insert into bridge_loop_publications"));
  assert.ok(publication);
  assert.ok(publication.values.some((value) => Array.isArray(value) && value[0] === "IN"));
});

test("publication blocks without a ready package or checksum-verified playback rendition", async () => {
  for (const options of [
    { packageRow: null, renditionRow: null },
    { packageRow: { ...undefined, id: "package-1", rights_grant_id: "grant-1", qc_case_id: "qc-1", legal_case_id: "legal-1", asset_version_ids: [], readiness_state: "READY" }, renditionRow: null },
  ]) {
    const h = harness([grant], true, false, undefined, options.packageRow, options.renditionRow);
    await assert.rejects(h.authorize({ context, data }), /Distribution Authorization Blocked/);
    assert.equal(h.writes.length, 0);
  }
});

test("publication blocks if destination package is bound to stale QC or legal evidence", async () => {
  const h = harness([grant], true, false, undefined, {
    id: "package-1",
    rights_grant_id: "grant-1",
    qc_case_id: "old-qc",
    legal_case_id: "legal-1",
    asset_version_ids: ["00000000-0000-4000-8000-000000000001"],
    readiness_state: "READY",
  });
  await assert.rejects(h.authorize({ context, data }), /current master and artwork/);
  assert.equal(h.writes.length, 0);
});
