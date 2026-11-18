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
  packageReady = true,
  titleStatus = "LICENSED",
  pricingApproved = true,
) {
  const writes: { query: string; values: unknown[] }[] = [];
  const title = {
    id: "title-1",
    slug: "film",
    name: "Film",
    status: titleStatus,
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
    if (query.includes("from bridge_title_gate_certifications")) return [gates];
    if (query.includes("from bridge_loop_consumer_pricing")) {
      return pricingApproved ? [{ access_tier: "TVOD", rental_price_inr: 79, purchase_price_inr: null, status: "APPROVED" }] : [];
    }
    if (query.includes("update bridge_titles")) {
      writes.push({ query, values });
      return [{ id: title.id }];
    }
    if (query.includes("from bridge_destination_packages")) return packageReady ? [{ id: "package-1", readiness_state: "READY" }] : [{ id: "package-1", readiness_state: "HOLD" }];
    if (query.includes("update bridge_destination_packages")) {
      if (!packageReady) return [];
      writes.push({ query, values });
      return [{ id: "package-1" }];
    }
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


test("certified Loop publication advances a licensing-ready Bridge title to buyer-visible", async () => {
  const h = harness([grant], true, false, undefined, true, "LICENSING_READY");
  const result = await h.authorize({ context, data });
  assert.equal((result as { status: string }).status, "AUTHORIZED");
  const advance = h.writes.find((write) => write.query.includes("update bridge_titles"));
  assert.ok(advance);
  assert.match(advance.query, /status=\x27LIVE_FOR_BUYERS\x27/);
  const event = h.writes.find((write) => write.query.includes("insert into bridge_title_events"));
  assert.ok(event);
  assert.ok(event.values.includes("LICENSING_READY"));
  assert.ok(event.values.includes("LIVE_FOR_BUYERS"));
  assert.equal((event.values as unknown[]).includes("LICENSING_READY"), true);
});

test("publication fails closed without explicitly approved TVOD pricing", async () => {
  const h = harness([grant], true, false, undefined, true, "LICENSED", false);
  await assert.rejects(h.authorize({ context, data }), /Super Admin-approved TVOD rental pricing/);
  assert.equal(h.writes.length, 0);
});

test("publication requires a certified Loop destination package", async () => {
  const h = harness([grant], true, false, undefined, false);
  await assert.rejects(h.authorize({ context, data }), /latest Crayons Loop destination package must be certified READY/);
  assert.equal(h.writes.length, 0);
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
