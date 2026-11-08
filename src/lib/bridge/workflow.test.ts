import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
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
    alter table bridge_assets add column asset_version_id uuid;
    alter table bridge_assets add column verified_object_key text;
    alter table bridge_assets add column storage_verified_at timestamptz;
    alter table bridge_assets add column checksum_sha256 text;
    create table bridge_title_events(title_id text,from_status text,to_status text,actor_user_id text,note text);
    create table bridge_audit_logs(id bigserial primary key,actor_user_id text,action text,entity_type text,entity_id text,metadata text,created_at timestamptz not null default now());`);
    await db.exec(
      readFileSync(
        new URL("../../../migrations/0010_bridge_prd_phase1.sql", import.meta.url),
        "utf8",
      ).replaceAll("public.", `${schema}.`),
    );
    await db.exec(
      readFileSync(
        new URL("../../../migrations/0021_bridge_rights_evidence_verification.sql", import.meta.url),
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
      "./audit": {
        writeAudit: async (event: { actorUserId: string; action: string; entityType: string; entityId: string; metadata: object }, tx: Sql) => {
          await tx`insert into bridge_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
            values (${event.actorUserId},${event.action},${event.entityType},${event.entityId},${JSON.stringify(event.metadata)})`;
        },
      },
      "./guards": { assertNotDevUser: () => undefined },
      "./oci-object-storage.server": {
        titleAssetKey: () => "unused-in-workflow-unit-test",
        signUpload: async () => { throw new Error("Upload signing is not exercised by this unit test"); },
        verifyObjectSha256: async () => { throw new Error("Object verification is not exercised by this unit test"); },
        sealVerifiedObject: async () => { throw new Error("Object sealing is not exercised by this unit test"); },
      },
    };
    const rightsEvidenceExports: Record<string, (...args: unknown[]) => unknown> = {};
    const rightsEvidenceSource = readFileSync(new URL("./rights-evidence.ts", import.meta.url), "utf8");
    runInNewContext(
      transpileModule(rightsEvidenceSource, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
      {
        exports: rightsEvidenceExports,
        Date,
        require: (name: string) => {
          if (name === "node:crypto") return { randomBytes };
          assert.ok(name in modules, name);
          return modules[name];
        },
      },
    );
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
    return {
      db, sql,
      save: exports.saveLoopLicense,
      review: exports.reviewWorkflow,
      settle: exports.recordSettlementEvidenceTx,
      submitRightsEvidence: rightsEvidenceExports.submitRightsEvidence,
    };
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

test("QC may pass but legal approval fails closed until agreement and ownership evidence are verified", async () => {
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
    await assert.rejects(
      f.sql.transaction((tx) =>
        f.review(tx, legal, {
          titleId: "title-123",
          stage: "LEGAL",
          decision: "APPROVE",
          note: "Ownership and agreement reviewed",
          grantId: saved.grantId,
        }),
      ),
      /independently reviewed executed-agreement and ownership-chain documents with matching SHA-256 checksums/,
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_titles"))[0].status,
      "RIGHTS_REVIEW",
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_rights_grants"))[0].status,
      "DRAFT",
    );
    assert.equal((await f.sql.query("select * from bridge_legal_cases")).length, 0);
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
test("agreement references cannot be reused across different titles or letter case", async () => {
  const f = await fixture();
  try {
    await f.sql.transaction((tx) => f.save(tx, owner, license));
    await f.sql.query(`insert into bridge_titles(id,owner_user_id,status,master_key,poster_key,updated_at)
      values ('title-456','owner','RIGHTS_REVIEW','sealed/master-2','sealed/poster-2',now())`);
    await assert.rejects(
      f.sql.transaction((tx) => f.save(tx, owner, { ...license, titleId: "title-456", agreementReference: "AGREEMENT-123" })),
      /Agreement reference is already assigned to another title/,
    );
    assert.equal((await f.sql.query("select * from bridge_rights_grants")).length, 1);
  } finally {
    await f.db.close();
  }
});

test("repeated identical rights evidence submission reuses one record and one audit event", async () => {
  const f = await fixture();
  try {
    await f.sql.query("update bridge_titles set status='RIGHTS_REVIEW' where id='title-123'");
    const saved = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as { grantId: string };
    const assetVersionId = "00000000-0000-4000-8000-000000000021";
    const checksum = "d".repeat(64);
    await f.sql.query(`insert into bridge_asset_versions
      (id,title_id,asset_group,asset_type,version,s3_key,checksum_sha256,byte_size,processing_state,created_by)
      values ($1,'title-123','DOCUMENT','RIGHTS_EVIDENCE',1,'sealed/rights-evidence.pdf',$2,2048,'PASSED','owner')`,
      [assetVersionId,checksum]);
    await f.sql.query(`insert into bridge_assets(id,title_id,kind,s3_key,byte_size,asset_version_id,verified_object_key,storage_verified_at,checksum_sha256)
      values ('rights-evidence-idempotent','title-123','rights_document','sealed/rights-evidence.pdf',2048,$1,'sealed/rights-evidence.pdf',now(),$2)`,[assetVersionId,checksum]);
    const input = {
      titleId: "title-123",
      grantId: saved.grantId,
      evidenceType: "EXECUTED_AGREEMENT" as const,
      assetVersionId,
    };
    const [first, second] = await Promise.all([
      f.sql.transaction((tx) => f.submitRightsEvidence(tx, owner, input)),
      f.sql.transaction((tx) => f.submitRightsEvidence(tx, owner, input)),
    ]);
    assert.deepEqual(second, first);
    assert.equal((await f.sql.query("select * from bridge_rights_evidence")).length, 1);
    assert.equal((await f.sql.query("select * from bridge_audit_logs where action='rights.evidence.submit'")).length, 1);
  } finally {
    await f.db.close();
  }
});

test("concurrent settlement reference submissions are idempotent and reject changed financial terms", async () => {
  const f = await fixture();
  const finance = { ...owner, userId: "finance", internalRole: "finance" as const };
  const input = {
    titleId: "title-123",
    reference: "SETTLEMENT-REF-2026-001",
    invoiceReference: "INV-2026-001",
    statementReference: "BANK-STATEMENT-001",
    amountPaise: 125000,
  };
  try {
    const [first, second] = await Promise.all([
      f.sql.transaction((tx) => f.settle(tx, finance, input)) as Promise<{ status: string; duplicate: boolean }>,
      f.sql.transaction((tx) => f.settle(tx, finance, { ...input, reference: "settlement-ref-2026-001" })) as Promise<{ status: string; duplicate: boolean }>,
    ]);
    assert.equal(first.status, "EXTERNAL_EVIDENCE_UNVERIFIED");
    assert.equal(second.status, "EXTERNAL_EVIDENCE_UNVERIFIED");
    assert.deepEqual(new Set([first.duplicate, second.duplicate]), new Set([false, true]));
    assert.equal((await f.sql.query("select * from bridge_settlement_reference_claims")).length, 1);
    assert.equal((await f.sql.query("select * from bridge_audit_logs where action='finance.settlement_evidence'")).length, 1);
    await assert.rejects(
      f.sql.transaction((tx) => f.settle(tx, finance, { ...input, amountPaise: 125001 })),
      /already recorded with different title or financial terms/,
    );
    assert.equal((await f.sql.query("select * from bridge_settlement_reference_claims")).length, 1);
  } finally {
    await f.db.close();
  }
});

test("multiple legacy records with the same agreement reference block retry for reconciliation", async () => {
  const f = await fixture();
  try {
    const first = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as { grantId: string };
    await f.sql.query(`insert into bridge_rights_grants
      (title_id,grant_type,territories,languages,media,window_start,window_end,exclusivity,evidence,status,created_by)
      select title_id,grant_type,territories,languages,media,window_start,window_end,exclusivity,evidence,status,created_by
      from bridge_rights_grants where id=$1`, [first.grantId]);
    await assert.rejects(
      f.sql.transaction((tx) => f.save(tx, owner, license)),
      /Multiple records already use this agreement reference/,
    );
    assert.equal((await f.sql.query("select * from bridge_rights_grants")).length, 2);
  } finally {
    await f.db.close();
  }
});

test("legal approval blocks when signatory and distribution authority evidence are missing", async () => {
  const f = await fixture();
  try {
    const saved = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as { grantId: string };
    await f.sql.transaction((tx) => f.review(tx, qc, {
      titleId: "title-123", stage: "QC", decision: "APPROVE", note: "Playback and codec checked",
    }));
    const agreementChecksum = "a".repeat(64);
    const ownershipChecksum = "b".repeat(64);
    await f.sql.query(`insert into bridge_asset_versions
      (id,title_id,asset_group,asset_type,version,s3_key,checksum_sha256,byte_size,processing_state,created_by)
      values
      ('00000000-0000-4000-8000-000000000001','title-123','DOCUMENT','RIGHTS_EVIDENCE',1,'sealed/agreement.pdf',$1,1024,'PASSED','owner'),
      ('00000000-0000-4000-8000-000000000002','title-123','DOCUMENT','RIGHTS_EVIDENCE',1,'sealed/ownership.pdf',$2,1024,'PASSED','owner')`,
      [agreementChecksum, ownershipChecksum]);
    await f.sql.query(`insert into bridge_assets(id,title_id,kind,s3_key,byte_size,asset_version_id,verified_object_key,storage_verified_at,checksum_sha256)
      values
      ('rights-agreement','title-123','rights_document','sealed/agreement.pdf',1024,'00000000-0000-4000-8000-000000000001','sealed/agreement.pdf',now(),$1),
      ('rights-ownership','title-123','rights_document','sealed/ownership.pdf',1024,'00000000-0000-4000-8000-000000000002','sealed/ownership.pdf',now(),$2)`,[agreementChecksum,ownershipChecksum]);
    await f.sql.query(`insert into bridge_rights_evidence
      (id,title_id,rights_grant_id,evidence_type,asset_version_id,checksum_sha256,submitted_by,status,reviewed_by,reviewed_at,review_note)
      values
      ('00000000-0000-4000-8000-000000000011','title-123',$1,'EXECUTED_AGREEMENT','00000000-0000-4000-8000-000000000001',$2,'owner','VERIFIED','legal',now(),'Executed agreement checked'),
      ('00000000-0000-4000-8000-000000000012','title-123',$1,'OWNERSHIP_CHAIN','00000000-0000-4000-8000-000000000002',$3,'owner','VERIFIED','legal',now(),'Ownership chain checked')`,
      [saved.grantId, agreementChecksum, ownershipChecksum]);
    await f.sql.query(`insert into bridge_rights_evidence_reviews
      (evidence_id,decision,reviewer_user_id,evidence_checksum_sha256,note)
      values
      ('00000000-0000-4000-8000-000000000011','VERIFIED','legal',$1,'Executed agreement checked'),
      ('00000000-0000-4000-8000-000000000012','VERIFIED','legal',$2,'Ownership chain checked')`,
      [agreementChecksum, ownershipChecksum]);
    await assert.rejects(
      f.sql.transaction((tx) => f.review(tx, legal, {
        titleId: "title-123", stage: "LEGAL", decision: "APPROVE",
        note: "Only agreement and ownership evidence supplied", grantId: saved.grantId,
      })),
      /requires independently verified executed agreement, ownership chain, signatory authority, and Master Distributor \/ sublicensing authority evidence/,
    );
    assert.equal((await f.sql.query<{status:string}>("select status from bridge_titles"))[0].status, "RIGHTS_REVIEW");
    assert.equal((await f.sql.query<{status:string}>("select status from bridge_rights_grants"))[0].status, "DRAFT");
    assert.equal((await f.sql.query("select * from bridge_legal_cases")).length, 0);
  } finally {
    await f.db.close();
  }
});

test("legal approval remains blocked when only one required evidence class is verified", async () => {
  const f = await fixture();
  try {
    const saved = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as { grantId: string };
    await f.sql.transaction((tx) => f.review(tx, qc, {
      titleId: "title-123", stage: "QC", decision: "APPROVE", note: "Playback and codec checked",
    }));
    const checksum = "c".repeat(64);
    await f.sql.query(`insert into bridge_asset_versions
      (id,title_id,asset_group,asset_type,version,s3_key,checksum_sha256,byte_size,processing_state,created_by)
      values ('00000000-0000-4000-8000-000000000003','title-123','DOCUMENT','RIGHTS_EVIDENCE',1,'sealed/agreement.pdf',$1,1024,'PASSED','owner')`,[checksum]);
    await f.sql.query(`insert into bridge_assets(id,title_id,kind,s3_key,byte_size,asset_version_id,verified_object_key,storage_verified_at,checksum_sha256)
      values ('rights-agreement-single','title-123','rights_document','sealed/agreement.pdf',1024,'00000000-0000-4000-8000-000000000003','sealed/agreement.pdf',now(),$1)`,[checksum]);
    await f.sql.query(`insert into bridge_rights_evidence
      (id,title_id,rights_grant_id,evidence_type,asset_version_id,checksum_sha256,submitted_by,status,reviewed_by,reviewed_at,review_note)
      values ('00000000-0000-4000-8000-000000000013','title-123',$1,'EXECUTED_AGREEMENT','00000000-0000-4000-8000-000000000003',$2,'owner','VERIFIED','legal',now(),'Agreement checked')`,[saved.grantId,checksum]);
    await f.sql.query(`insert into bridge_rights_evidence_reviews
      (evidence_id,decision,reviewer_user_id,evidence_checksum_sha256,note)
      values ('00000000-0000-4000-8000-000000000013','VERIFIED','legal',$1,'Agreement checked')`,[checksum]);
    await assert.rejects(
      f.sql.transaction((tx) => f.review(tx, legal, {
        titleId: "title-123", stage: "LEGAL", decision: "APPROVE",
        note: "Attempt without ownership chain", grantId: saved.grantId,
      })),
      /requires independently verified executed agreement, ownership chain, signatory authority, and Master Distributor \/ sublicensing authority evidence/,
    );
    assert.equal((await f.sql.query<{status:string}>("select status from bridge_rights_grants"))[0].status, "DRAFT");
    assert.equal((await f.sql.query("select * from bridge_legal_cases")).length, 0);
  } finally {
    await f.db.close();
  }
});

test("concurrent identical license saves serialize to one DRAFT grant and one audit event", async () => {
  const f = await fixture();
  try {
    const results = await Promise.all([
      f.sql.transaction((tx) => f.save(tx, owner, license)),
      f.sql.transaction((tx) => f.save(tx, owner, license)),
    ]) as Array<{grantId:string}>;
    assert.equal(results[0].grantId, results[1].grantId);
    assert.equal((await f.sql.query("select * from bridge_rights_grants")).length, 1);
    assert.equal((await f.sql.query("select * from bridge_audit_logs where action='license.loop_draft'")).length, 1);
  } finally {
    await f.db.close();
  }
});

test("saving identical license terms repeatedly reuses one draft and one audit event", async () => {
  const f = await fixture();
  try {
    const first = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as { grantId: string };
    const second = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as { grantId: string };
    assert.equal(second.grantId, first.grantId);
    assert.equal((await f.sql.query("select * from bridge_rights_grants")).length, 1);
    assert.equal((await f.sql.query("select * from bridge_audit_logs where action='license.loop_draft'")).length, 1);
  } finally {
    await f.db.close();
  }
});

test("same agreement reference with materially different terms is rejected", async () => {
  const f = await fixture();
  try {
    await f.sql.transaction((tx) => f.save(tx, owner, license));
    await assert.rejects(
      f.sql.transaction((tx) => f.save(tx, owner, { ...license, exclusivity: "EXCLUSIVE" })),
      /different licensing terms/,
    );
    assert.equal((await f.sql.query("select * from bridge_rights_grants")).length, 1);
  } finally {
    await f.db.close();
  }
});

test("exclusive grants in disjoint exploitation media do not block a Loop TVOD draft", async () => {
  const f = await fixture();
  try {
    await f.sql.query(`insert into bridge_rights_grants
      (title_id,grant_type,territories,languages,media,window_start,window_end,exclusivity,evidence,status,created_by)
      values ('title-123','DISTRIBUTION','["WORLDWIDE"]'::jsonb,'["Malayalam"]'::jsonb,'["SVOD"]'::jsonb,
      '2026-01-01T00:00:00Z','2099-01-01T00:00:00Z','EXCLUSIVE','[]'::jsonb,'DRAFT','owner')`);
    const result = (await f.sql.transaction((tx) => f.save(tx, owner, license))) as {grantId:string};
    assert.ok(result.grantId);
    assert.equal((await f.sql.query("select * from bridge_rights_grants")).length, 2);
  } finally {
    await f.db.close();
  }
});

test("overlapping exclusive and non-exclusive grants are rejected", async () => {
  const f = await fixture();
  try {
    await f.sql.transaction((tx) => f.save(tx, owner, { ...license, exclusivity: "EXCLUSIVE" }));
    await assert.rejects(
      f.sql.transaction((tx) => f.save(tx, owner, { ...license, agreementReference: "agreement-456" })),
      /Conflicting exclusive/,
    );
    assert.equal((await f.sql.query("select * from bridge_rights_grants")).length, 1);
  } finally {
    await f.db.close();
  }
});

test("license author cannot approve their own agreement", async () => {
  const f = await fixture();
  try {
    const admin = { ...owner, userId: "admin", internalRole: "admin" as const };
    const saved = (await f.sql.transaction((tx) => f.save(tx, admin, license))) as {
      grantId: string;
    };
    await f.sql.query("update bridge_titles set status='RIGHTS_REVIEW'");
    await assert.rejects(
      f.sql.transaction((tx) =>
        f.review(tx, admin, {
          titleId: "title-123",
          stage: "LEGAL",
          decision: "APPROVE",
          note: "Agreement checked",
          grantId: saved.grantId,
        }),
      ),
      /Another legal reviewer/,
    );
    assert.equal(
      (await f.sql.query<{ status: string }>("select status from bridge_rights_grants"))[0].status,
      "DRAFT",
    );
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
