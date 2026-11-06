import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { assertVerifiedTitleIngestReady } from "./qc-readiness.ts";

async function fixture() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec("create role anon; create role authenticated;");
  for (const file of [
    "0004_bridge.sql",
    "0010_bridge_prd_phase1.sql",
    "0018_bridge_rights_ready_submission.sql",
    "0023_bridge_server_authoritative_uploads.sql",
  ]) await db.exec(readFileSync(join(process.cwd(), "migrations", file), "utf8"));
  await db.exec(`
    insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
    values ('qc-title-123','qc-title','QC title','owner','independent_creator','PREPARING');
    insert into bridge_assets
      (id,title_id,kind,s3_key,created_by,byte_size,verified_object_key,checksum_sha256,
       storage_provider,storage_bucket,storage_verified_at)
    values
      ('qc-master-1','qc-title-123','master','sealed/master','owner',100,'sealed/master',repeat('a',64),'oci','bucket',now()),
      ('qc-poster-1','qc-title-123','poster','sealed/poster','owner',100,'sealed/poster',repeat('b',64),'oci','bucket',now()),
      ('qc-cert-1','qc-title-123','censor_certificate','sealed/cert','owner',100,'sealed/cert',repeat('c',64),'oci','bucket',now());
    insert into bridge_rights_grants (title_id,evidence,status,created_by)
    values ('qc-title-123','[{"type":"AUTHORIZATION_ATTESTATION","rightsBasis":"OWNER","authorizationConfirmed":true}]'::jsonb,'DRAFT','owner');
    insert into bridge_title_submission_intake
      (title_id,authority_type,authorization_evidence_type,authorization_confirmed)
    values ('qc-title-123','RIGHTS_OWNER','RIGHTS_AGREEMENT',true);
  `);
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      let query = strings[0] ?? "";
      for (let i = 0; i < values.length; i++) query += `$${i + 1}${strings[i + 1] ?? ""}`;
      return (await db.query(query, values)).rows;
    },
    { query: async (query: string, values: unknown[] = []) => (await db.query(query, values)).rows,
      transaction: async <T>(fn: (tx: any) => Promise<T>) => fn(sql) },
  );
  return { db, sql };
}

test("QC readiness requires verified master, poster, censor certificate and rights authority", async () => {
  const { db, sql } = await fixture();
  try {
    await assert.doesNotReject(() => assertVerifiedTitleIngestReady(sql as never, "qc-title-123"));
    await db.exec("delete from bridge_assets where id='qc-cert-1'");
    await assert.rejects(() => assertVerifiedTitleIngestReady(sql as never, "qc-title-123"), /censor\/legal certificate/);
  } finally {
    await db.close();
  }
});

test("QC readiness rejects missing rights-holder classification", async () => {
  const { db, sql } = await fixture();
  try {
    await db.exec("delete from bridge_title_submission_intake where title_id='qc-title-123'");
    await assert.rejects(() => assertVerifiedTitleIngestReady(sql as never, "qc-title-123"), /rights-holder classification/);
  } finally {
    await db.close();
  }
});
