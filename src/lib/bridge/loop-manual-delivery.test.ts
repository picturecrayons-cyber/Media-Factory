import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import * as policy from "./loop-delivery-policy.ts";
import * as workflowPolicy from "./workflow-policy.ts";
import * as rights from "./rights-coverage.ts";
import * as rbac from "./rbac.ts";
import type { Sql } from "../db";

const titleId = "title-manual-123";
const grantId = "10000000-0000-4000-8000-000000000001";
const terms = { titleId, territories: ["WORLDWIDE"], languages: ["Malayalam"],
  windowStart: "2026-01-01T00:00:00.000Z", windowEnd: "2099-01-01T00:00:00.000Z",
  exclusivity: "NON_EXCLUSIVE", agreementReference: "agreement-verified", ownershipReference: "ownership-verified",
  rightsOwnerSharePct: 80, distributorSharePct: 20 };
const publicationData = { bridgeTitleId: titleId, destination: "CRAYONS_LOOP", territories: terms.territories,
  languages: terms.languages, exploitationModels: ["TVOD"], accessTier: "TVOD", windowStart: terms.windowStart, windowEnd: terms.windowEnd };
type Handler = (args: { context: { userId: string }; data?: unknown }) => Promise<any>;
async function fixture(model: "TVOD" | "AVOD" = "TVOD") {
  const db = new PGlite();
  await db.exec(`create table bridge_titles(id text primary key,owner_user_id text,owner_account_type text,owner_organization_id uuid,
    status text,slug text,name text,synopsis text,language text,year int,runtime_minutes int,content_type text,master_key text,poster_key text,updated_at timestamptz);
    create table bridge_rights_grants(id uuid primary key default gen_random_uuid(),title_id text references bridge_titles(id),grant_type text,
      territories jsonb,languages jsonb,media jsonb,window_start timestamptz,window_end timestamptz,exclusivity text,evidence jsonb,status text,created_by text,created_at timestamptz default now());
    create table bridge_qc_cases(id uuid default gen_random_uuid(),title_id text,status text,reviewer_findings jsonb,reviewed_by text,reviewed_at timestamptz,created_at timestamptz default now());
    create table bridge_legal_cases(id uuid default gen_random_uuid(),title_id text,status text,evidence jsonb,reviewed_by text,reviewed_at timestamptz,created_at timestamptz default now());
    create table bridge_assets(id text,title_id text,kind text,s3_key text,byte_size bigint);
    create table bridge_title_events(title_id text,from_status text,to_status text,actor_user_id text,note text);
    create table bridge_audit_logs(actor_user_id text,action text,entity_type text,entity_id text,metadata text);
    create table loop_titles(id text primary key,bridge_title_id text unique,slug text,title text,synopsis text,content_type text,language text,year int,duration_minutes int,
      poster_path text,playback_path text,metadata jsonb,status text,listed boolean,published boolean,featured boolean,access_tier text,updated_at timestamptz);
    create table bridge_loop_publications(id text primary key,bridge_title_id text unique,loop_title_id text,authorization_status text,
      territories text[],languages text[],exploitation_models text[],window_start timestamptz,window_end timestamptz,approved_by text,approved_at timestamptz,
      revoked_at timestamptz,metadata jsonb,updated_at timestamptz);`);
  await db.exec(readFileSync(new URL("../../../migrations/0022_bridge_loop_manual_delivery.sql", import.meta.url), "utf8"));
  await db.query(`insert into bridge_titles values($1,'owner','independent_creator',null,'LICENSING_READY','jananam','Jananam 1947 Pranayam Thudarunnu','Synopsis','Malayalam',2024,106,'Film','sealed/master','sealed/poster',now())`, [titleId]);
  await db.query(`insert into bridge_rights_grants(id,title_id,territories,languages,media,window_start,window_end,exclusivity,evidence,status,created_by)
    values($1,$2,'["WORLDWIDE"]','["Malayalam"]',$3::jsonb,$4,$5,'NON_EXCLUSIVE',$6::jsonb,'VALID','owner')`,
  [grantId, titleId, JSON.stringify(["CRAYONS_LOOP", model]), terms.windowStart, terms.windowEnd,
    JSON.stringify([{ agreementReference: terms.agreementReference, ownershipReference: terms.ownershipReference, commercialTerms: { rightsOwnerSharePct: 80, distributorSharePct: 20 } }])]);
  await db.query(`insert into bridge_qc_cases(title_id,status,reviewer_findings,reviewed_by,reviewed_at) values($1,'PASSED','[{"masterKey":"sealed/master","posterKey":"sealed/poster"}]','qc',now())`, [titleId]);
  await db.query(`insert into bridge_legal_cases(title_id,status,evidence,reviewed_by,reviewed_at) values($1,'APPROVED',$2::jsonb,'legal',now())`, [titleId, JSON.stringify([{ grantId }])]);
  function adapter(query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>): Sql {
    const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
      let text = strings[0]; params.forEach((_, i) => { text += `$${i + 1}${strings[i + 1]}`; });
      return (await query(text, params)).rows;
    }) as Sql;
    sql.query = async (text, params) => (await query(text, params)).rows;
    sql.transaction = (fn) => db.transaction((tx) => fn(adapter((text, params) => tx.query(text, params))));
    return sql;
  }
  const sql = adapter((text, params) => db.query(text, params));
  const actors: Record<string, rbac.Actor> = {
    owner: { userId: "owner", emailVerified: true, accountType: "independent_creator", internalRole: null },
    sender: { userId: "sender", emailVerified: true, accountType: "independent_creator", internalRole: "admin" },
    reviewer: { userId: "reviewer", emailVerified: true, accountType: "independent_creator", internalRole: "admin" },
    other: { userId: "other", emailVerified: true, accountType: "independent_creator", internalRole: "admin" },
    viewer: { userId: "viewer", emailVerified: true, accountType: "independent_creator", internalRole: "viewer" },
    legal: { userId: "legal", emailVerified: true, accountType: "independent_creator", internalRole: "legal_reviewer" },
  };
  const modules: Record<string, unknown> = {
    "node:crypto": await import("node:crypto"),
    "@tanstack/react-start": { createServerFn: () => {
      let schema: z.ZodType | undefined;
      const b = { middleware: () => b, validator: (value: z.ZodType) => { schema = value; return b; }, handler: (handler: Handler) => (args: Parameters<Handler>[0]) => handler({ ...args, data: schema ? schema.parse(args.data) : args.data }) };
      return b;
    } },
    zod: { z }, "@/lib/auth/middleware": { authMiddleware: {} }, "@/lib/db": { getSql: async () => sql },
    "./rbac": rbac, "./session": { requireVerifiedActor: async (userId: string) => { if (!actors[userId]) throw new Error("Forbidden"); return actors[userId]; } },
    "./guards": { assertNotDevUser: () => {} },
    "./titles": { loadTitle: async (id: string) => { const [t] = await sql<any>`select * from bridge_titles where id=${id}`; return t ? { ownerUserId: t.owner_user_id, ownerAccountType: t.owner_account_type, status: t.status } : null; } },
    "./env": { bridgeEnv: {} }, "./workflow-policy": workflowPolicy, "./rights-coverage": rights,
    "./loop-delivery-policy": policy, "@/lib/bridge/loop-lanes": { loopStageType: () => "Film" },
    "./audit": { writeAudit: async (event: { actorUserId: string; action: string; entityType: string; entityId: string; metadata: unknown }, tx: Sql) => {
      await tx`insert into bridge_audit_logs values(${event.actorUserId},${event.action},${event.entityType},${event.entityId},${JSON.stringify(event.metadata)})`;
    } },
  };
  function load(file: string): Record<string, any> {
    const exports = {};
    runInNewContext(transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
      { exports, Date, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    return exports;
  }
  const core = load("./loop-delivery-core.ts"); modules["./loop-delivery-core"] = core;
  const publishing = load("./loop-publication.ts"); modules["./loop-publication"] = publishing;
  const workflow = load("./workflow.ts"); modules["./workflow"] = workflow;
  const manual = load("./loop-delivery.ts");
  async function call(name: string, userId: string, data?: unknown) {
    return (manual[name] ?? publishing[name] ?? workflow[name])({ context: { userId }, data });
  }
  async function publish(overrides: Record<string, unknown> = {}) {
    const latest = await sql<{ id: string }>`select id from bridge_loop_deliveries order by version desc limit 1`;
    return call("authorizeLoopPublication", "reviewer", { ...publicationData, deliveryId: latest[0]?.id, ...overrides });
  }
  async function prepare() { return call("prepareManualLoopDelivery", "sender", { titleId, grantId, model }); }
  async function deliver() {
    const saved = await prepare();
    await call("recordManualLoopDelivery", "sender", { titleId, deliveryId: saved.id, reference: "manual-transfer-123" });
    return saved;
  }
  async function approve() {
    const saved = await deliver();
    await call("reviewManualLoopDelivery", "reviewer", { titleId, deliveryId: saved.id, decision: "APPROVE", note: "Loop explicitly accepted this version", reference: "loop-acceptance-123" });
    return saved;
  }
  return { db, sql, call, publish, prepare, deliver, approve };
}

test("stable JSON hashing ignores jsonb object order, but not changed content", () => {
  assert.equal(policy.deliveryHash({ b: 2, a: { y: 3, x: 1 } }), policy.deliveryHash({ a: { x: 1, y: 3 }, b: 2 }));
  assert.notEqual(policy.deliveryHash({ a: 1 }), policy.deliveryHash({ a: 2 }));
  assert.throws(() => policy.assertManualModelCanPublish("AVOD"), /AVOD/);
});
test("TVOD handoff and independent acceptance never publish until a separate explicit action", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.publish(), /Manual Loop delivery/);
    const saved = await f.deliver();
    await assert.rejects(f.publish(), /Manual Loop delivery/);
    await assert.rejects(f.call("reviewManualLoopDelivery", "sender", { titleId, deliveryId: saved.id, decision: "APPROVE", note: "My own handoff", reference: "loop-reply-123" }), /Another authorized operator/);
    await f.call("reviewManualLoopDelivery", "reviewer", { titleId, deliveryId: saved.id, decision: "APPROVE", note: "Loop explicitly accepted this version", reference: "loop-reply-123" });
    assert.equal((await f.sql`select * from loop_titles`).length, 0);
    await assert.rejects(f.publish({ deliveryId: undefined }), /explicitly selected/);
    await assert.rejects(f.publish({ deliveryId: "20000000-0000-4000-8000-000000000002" }), /explicitly selected/);
    assert.equal((await f.publish()).status, "AUTHORIZED");
    assert.equal((await f.sql<{ status: string }>`select status from bridge_loop_deliveries`)[0].status, "PUBLISHED");
    assert.equal((await f.sql<{ published: boolean }>`select published from loop_titles`)[0].published, true);
    await assert.rejects(f.publish(), /Manual Loop delivery/);
  } finally { await f.db.close(); }
});
test("AVOD supports prepared, delivered and independently approved states but never FREE publication", async () => {
  const f = await fixture("AVOD");
  try {
    await f.approve();
    assert.equal((await f.sql<{ status: string }>`select status from bridge_loop_deliveries`)[0].status, "APPROVED");
    await assert.rejects(f.publish({ exploitationModels: ["AVOD"], accessTier: "FREE" }), /AVOD/);
    assert.equal((await f.sql`select * from loop_titles`).length, 0);
    const result = await f.call("getManualLoopDelivery", "owner", { titleId });
    assert.equal(result.deliveries[0].manifest.model, "AVOD");
    assert.ok(!JSON.stringify(result.deliveries[0].manifest).includes("ownership-verified"));
  } finally { await f.db.close(); }
});
test("owner can draft AVOD terms but cannot approve or perform privileged delivery", async () => {
  const f = await fixture();
  try {
    const saved = await f.call("submitManualLoopLicense", "owner", { terms, model: "AVOD" });
    const [g] = await f.sql<{ media: string[]; status: string }>`select media,status from bridge_rights_grants where id=${saved.grantId}`;
    assert.deepEqual(g.media, ["CRAYONS_LOOP", "AVOD"]); assert.equal(g.status, "DRAFT");
    await assert.rejects(f.call("prepareManualLoopDelivery", "owner", { titleId, grantId, model: "TVOD" }), /Forbidden/);
    await assert.rejects(f.call("prepareManualLoopDelivery", "viewer", { titleId, grantId, model: "TVOD" }), /Forbidden/);
    assert.equal((await f.sql`select * from loop_titles`).length, 0);
  } finally { await f.db.close(); }
});
test("missing QC/legal, expired rights and draft lifecycle remain blocked", async () => {
  for (const mutation of ["delete from bridge_qc_cases", "delete from bridge_legal_cases", "update bridge_rights_grants set window_end='2000-01-01'", "update bridge_titles set status='DRAFT'"]) {
    const f = await fixture();
    try { await f.sql.query(mutation); await assert.rejects(f.prepare(), /blocked|expired|Invalid|date/i); assert.equal((await f.sql`select * from bridge_loop_deliveries`).length, 0); }
    finally { await f.db.close(); }
  }
});
test("metadata, assets, license changes and mismatched publish dimensions invalidate acceptance", async () => {
  for (const mutation of ["update bridge_titles set synopsis='Changed'", "update bridge_titles set master_key='changed/master'", "update bridge_rights_grants set exclusivity='EXCLUSIVE'", "update bridge_rights_grants set status='REVOKED'"]) {
    const f = await fixture();
    try { await f.approve(); await f.sql.query(mutation); await assert.rejects(f.publish()); assert.equal((await f.sql`select * from loop_titles`).length, 0); }
    finally { await f.db.close(); }
  }
  const f = await fixture();
  try {
    await f.approve();
    await assert.rejects(f.publish({ windowStart: "2027-01-01T00:00:00.000Z" }), /exactly match/);
    await assert.rejects(f.call("extendDistributionWindow", "reviewer", { bridgeTitleId: titleId, newWindowEnd: terms.windowEnd }), /new approved license/);
  } finally { await f.db.close(); }
});
test("rejected or superseded packages cannot be published", async () => {
  const f = await fixture();
  try {
    const rejected = await f.deliver();
    await f.call("reviewManualLoopDelivery", "reviewer", { titleId, deliveryId: rejected.id, decision: "REJECT", reference: "buyer-return-123", note: "Buyer requested corrected package" });
    await assert.rejects(f.publish(), /Manual Loop delivery/);
    const approved = await f.approve();
    const newest = await f.prepare(); assert.ok(newest.version > approved.version);
    await assert.rejects(f.publish(), /Manual Loop delivery/);
    await assert.rejects(f.call("reviewManualLoopDelivery", "other", { titleId, deliveryId: approved.id, decision: "APPROVE", reference: "buyer-reply-456", note: "Trying an older version" }), /latest/);
  } finally { await f.db.close(); }
});
test("audit failure rolls back publication and acceptance consumption atomically", async () => {
  const f = await fixture();
  try {
    await f.approve(); await f.sql`drop table bridge_audit_logs`;
    await assert.rejects(f.publish());
    assert.equal((await f.sql`select * from loop_titles`).length, 0);
    assert.equal((await f.sql`select * from bridge_loop_publications`).length, 0);
    assert.equal((await f.sql<{ status: string }>`select status from bridge_loop_deliveries`)[0].status, "APPROVED");
  } finally { await f.db.close(); }
});
