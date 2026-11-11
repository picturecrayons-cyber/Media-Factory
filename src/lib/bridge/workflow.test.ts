import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as policy from "./workflow-policy.ts";
import * as rbac from "./rbac.ts";
import * as assetRoles from "./asset-roles.ts";
import { submitTitleForQc } from "./title-submission.ts";
import type { Sql } from "../db";

type TestDb = {
  exec(text: string): Promise<unknown>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: Pick<TestDb, "query">) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};
async function testDatabase(): Promise<{ db: TestDb; schema: string }> {
  const binding = process.env.BRIDGE_WORKFLOW_TEST_DATABASE_URL;
  if (!binding) return { db: new PGlite(), schema: "public" };
  // Static credentials for the disposable CI service only. Never use production bindings.
  const expected = "postgres://workflow_test:workflow_test@127.0.0.1:5432/bridge_workflow_test";
  if (binding !== expected || process.env.CI !== "true")
    throw new Error("Refusing non-ephemeral workflow test database");
  const schema = "workflow_" + randomUUID().replaceAll("-", "");
  const pool = new Pool({
    connectionString: binding,
    max: 4,
    connectionTimeoutMillis: 5000,
    options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000`,
  });
  await pool.query(`create schema ${schema}`);
  const db: TestDb = {
    exec: async (text) => pool.query(text),
    query: async <T>(text: string, params?: unknown[]) => ({
      rows: (await pool.query(text, params)).rows as T[],
    }),
    transaction: async <T>(fn: (tx: Pick<TestDb, "query">) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: TestDb = {
          ...db,
          exec: async (text) => client.query(text),
          query: async <R>(text: string, params?: unknown[]) => ({
            rows: (await client.query(text, params)).rows as R[],
          }),
        };
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => {
      try {
        await pool.query(`drop schema ${schema} cascade`);
      } finally {
        await pool.end();
      }
    },
  };
  return { db, schema };
}
async function fixture() {
  const { db, schema } = await testDatabase();
  try {
    await db.exec(`create table bridge_titles(
      id text primary key,
      owner_user_id text,
      owner_account_type text not null default 'independent_creator',
      owner_organization_id uuid,
      status text,
      master_key text,
      poster_key text,
      updated_at timestamptz
    );
    create table bridge_assets(id text,title_id text,kind text,s3_key text,byte_size bigint);
    create table bridge_title_events(title_id text,from_status text,to_status text,actor_user_id text,note text);
    create table bridge_audit_logs(actor_user_id text,action text,entity_type text,entity_id text,metadata text);`);
    await db.exec(
      readFileSync(
        new URL("../../../migrations/0010_bridge_prd_phase1.sql", import.meta.url),
        "utf8",
      ).replaceAll("public.", `${schema}.`),
    );
    await db.exec(`insert into bridge_titles(id,owner_user_id,status,master_key,poster_key,updated_at)
      values('title-123','owner','QC_REVIEW','sealed/master','sealed/poster',now());
    insert into bridge_assets values
      ('master','title-123','master','sealed/master',100),
      ('legacy-poster','title-123','poster','older/unreferenced-poster',100),
      ('poster-vertical','title-123','poster_vertical','sealed/poster',100);`);
    function adapter(query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
      const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
        let text = strings[0];
        params.forEach((_, i) => {
          text += `$${i + 1}${strings[i + 1]}`;
        });
        return (await query(text, params)).rows;
      }) as Sql;
      sql.query = async (text, params) => (await query(text, params)).rows as never;
      sql.transaction = (fn) =>
        db.transaction((tx) => fn(adapter((text, params) => tx.query(text, params))));
      return sql;
    }
    const sql = adapter((text, params) => db.query(text, params));
    const builder = () => {
      const b = { middleware: () => b, validator: () => b, handler: (fn: unknown) => fn };
      return b;
    };
    const modules: Record<string, unknown> = {
      "@tanstack/react-start": { createServerFn: builder },
      zod: { z },
      "@/lib/auth/middleware": { authMiddleware: {} },
      "@/lib/db": { getSql: async () => sql },
      "./session": {},
      "./rbac": rbac,
      "./asset-roles": assetRoles,
      "./titles": {},
    "./env": {bridgeEnv:{}},
      "./workflow-policy": policy,
    };
    const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
    const source = readFileSync(new URL("./workflow.ts", import.meta.url), "utf8");
    runInNewContext(
      transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
      {
        exports,
        Date,
        require: (name: string) => {
          assert.ok(name in modules, name);
          return modules[name];
        },
      },
    );
    return { db, sql, save: exports.saveLoopLicense, review: exports.reviewWorkflow };
  } catch (error) {
    await db.close();
    throw error;
  }
}
const owner = {
  userId: "owner",
  emailVerified: true,
  accountType: "independent_creator" as const,
  internalRole: null,
};
const qc = { ...owner, userId: "qc", internalRole: "qc_reviewer" as const };
const legal = { ...owner, userId: "legal", internalRole: "legal_reviewer" as const };
const license = {
  titleId: "title-123",
  territories: ["WORLDWIDE"],
  languages: ["Malayalam"],
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2099-01-01T00:00:00.000Z",
  exclusivity: "NON_EXCLUSIVE",
  agreementReference: "agreement-123",
  ownershipReference: "ownership-123",
  rightsOwnerSharePct: 80,
  distributorSharePct: 20,
};

test("real SQL services persist QC, independently approved license, lifecycle and audit", async () => {
  const f = await fixture();
  try {
    const saved = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as {
      grantId: string;
    };
    await f.sql.transaction((tx) =>
      f.review(tx, qc, {
        titleId: "title-123",
        stage: "QC",
        decision: "APPROVE",
        note: "Playback and codec checked",
      }),
    );
    await f.sql.transaction((tx) =>
      f.review(tx, legal, {
        titleId: "title-123",
        stage: "LEGAL",
        decision: "APPROVE",
        note: "Ownership and agreement verified",
        grantId: saved.grantId,
      }),
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_titles"))[0].status,
      "LICENSING_READY",
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_rights_grants"))[0].status,
      "VALID",
    );
    assert.equal((await f.sql.query("select * from bridge_audit_logs")).length, 3);
  } finally {
    await f.db.close();
  }
});
test("unauthorized review and unverified current assets cannot clear QC", async () => {
  const f = await fixture();
  try {
    const data = {
      titleId: "title-123",
      stage: "QC",
      decision: "APPROVE",
      note: "Review findings",
    };
    await assert.rejects(
      f.sql.transaction((tx) => f.review(tx, owner, data)),
      /Forbidden/,
    );
    await f.sql.query("update bridge_assets set byte_size=null where kind='master'");
    await assert.rejects(
      f.sql.transaction((tx) => f.review(tx, qc, data)),
      /Verified/,
    );
    assert.equal((await f.sql.query("select * from bridge_qc_cases")).length, 0);
  } finally {
    await f.db.close();
  }
});
test("a stale artwork pointer cannot clear QC even when a verified vertical poster exists", async () => {
  const f = await fixture();
  try {
    await f.sql.query("update bridge_titles set poster_key='old/sealed/poster'");
    await assert.rejects(
      f.sql.transaction((tx) =>
        f.review(tx, qc, {
          titleId: "title-123",
          stage: "QC",
          decision: "APPROVE",
          note: "Check current artwork pointer",
        }),
      ),
      /Verified/,
    );
    assert.equal((await f.sql.query("select * from bridge_qc_cases")).length, 0);
  } finally {
    await f.db.close();
  }
});

test("an audit failure rolls back review records and lifecycle", async () => {
  const f = await fixture();
  try {
    await f.sql.query("drop table bridge_audit_logs");
    await assert.rejects(
      f.sql.transaction((tx) =>
        f.review(tx, qc, {
          titleId: "title-123",
          stage: "QC",
          decision: "APPROVE",
          note: "Real review findings",
        }),
      ),
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_titles"))[0].status,
      "QC_REVIEW",
    );
    assert.equal((await f.sql.query("select * from bridge_qc_cases")).length, 0);
  } finally {
    await f.db.close();
  }
});
test("license constraints reject unsupported territory, bad window and invalid share totals", () => {
  assert.equal(policy.loopLicenseInput.safeParse(license).success, true);
  for (const data of [
    { ...license, territories: ["IN"] },
    { ...license, windowEnd: license.windowStart },
    { ...license, distributorSharePct: 30 },
  ])
    assert.equal(policy.loopLicenseInput.safeParse(data).success, false);
  assert.equal(policy.publicationIsActive("REVOKED", null, null), false);
  assert.equal(policy.publicationIsActive("AUTHORIZED", null, "2000-01-01"), false);
});

test("concurrent reviewer calls cannot approve the same lifecycle twice", async () => {
  const f = await fixture();
  try {
    const data = {
      titleId: "title-123",
      stage: "QC",
      decision: "APPROVE",
      note: "Verified playback review",
    };
    const results = await Promise.allSettled([
      f.sql.transaction((tx) => f.review(tx, qc, data)),
      f.sql.transaction((tx) => f.review(tx, qc, data)),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await f.sql.query("select * from bridge_qc_cases")).length, 1);
  } finally {
    await f.db.close();
  }
});
test("only Super Admin can approve and can self-approve with an audited override reason", async () => {
  const f = await fixture();
  try {
    const superAdmin = { ...owner, userId: "super-admin", internalRole: "super_admin" as const };
    const saved = (await f.sql.transaction((tx) => f.save(tx, superAdmin, license))) as {
      grantId: string;
    };
    await f.sql.query("update bridge_titles set status='RIGHTS_REVIEW'");
    await assert.rejects(
      f.sql.transaction((tx) =>
        f.review(tx, legal, {
          titleId: "title-123",
          stage: "LEGAL",
          decision: "APPROVE",
          note: "Legal reviewer cannot finalize",
          grantId: saved.grantId,
        }),
      ),
      /Forbidden/,
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_rights_grants"))[0].status,
      "DRAFT",
    );
    await f.sql.transaction((tx) =>
      f.review(tx, superAdmin, {
        titleId: "title-123",
        stage: "LEGAL",
        decision: "APPROVE",
        note: "Super Admin verified agreement and ownership evidence",
        grantId: saved.grantId,
      }),
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_rights_grants"))[0].status,
      "VALID",
    );
    const evidence = await f.sql.query<{ evidence: unknown }>("select evidence from bridge_legal_cases");
    assert.match(JSON.stringify(evidence.rows[0]?.evidence), /superAdminSelfApprovalOverride/);
    assert.match(JSON.stringify(evidence.rows[0]?.evidence), /true/);
  } finally {
    await f.db.close();
  }
});


test("Submit for QC advances PREPARING with the referenced vertical poster and writes lifecycle plus audit only", async () => {
  const f = await fixture();
  try {
    await f.sql.query(`
      insert into bridge_titles(id,owner_user_id,status,master_key,poster_key,updated_at)
      values ('qc-submit-title','owner','PREPARING','sealed/qc-master','sealed/qc-poster',now())
    `);
    await f.sql.query(`
      insert into bridge_assets values
        ('qc-master','qc-submit-title','master','sealed/qc-master',4096),
        ('qc-old-poster','qc-submit-title','poster','older/unreferenced-poster',512),
        ('qc-vertical-poster','qc-submit-title','poster_vertical','sealed/qc-poster',1024)
    `);
    const title = {
      id: "qc-submit-title",
      status: "PREPARING" as const,
      masterKey: "sealed/qc-master",
      posterKey: "sealed/qc-poster",
    };
    const result = await submitTitleForQc(f.sql, title, "owner", "Submit verified title for QC");
    assert.equal(result.title.status, "QC_REVIEW");
    assert.equal(
      (await f.sql.query<{ status: string }>(
        "select status from bridge_titles where id='qc-submit-title'",
      ))[0].status,
      "QC_REVIEW",
    );
    assert.equal(
      (await f.sql.query(
        "select * from bridge_title_events where title_id='qc-submit-title' and from_status='PREPARING' and to_status='QC_REVIEW'",
      )).length,
      1,
    );
    assert.equal(
      (await f.sql.query(
        "select * from bridge_audit_logs where entity_id='qc-submit-title' and action='title.advance'",
      )).length,
      1,
    );
    assert.equal(
      (await f.sql.query(
        "select * from bridge_qc_cases where title_id='qc-submit-title'",
      )).length,
      0,
    );
  } finally {
    await f.db.close();
  }
});
