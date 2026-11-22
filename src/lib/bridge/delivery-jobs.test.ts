import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = readFileSync(new URL("./delivery-jobs.ts", import.meta.url), "utf8");

test("delivery requests are idempotent per requester and client request key", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table bridge_delivery_jobs (
        id uuid primary key,
        title_id text not null,
        job_type text not null,
        status text not null,
        requested_by text not null,
        idempotency_key uuid not null,
        unique(requested_by,idempotency_key)
      );
    `);
    const key = "00000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into bridge_delivery_jobs values ($1,'film-1','human_qc','requested','studio-a',$2) on conflict (requested_by,idempotency_key) do nothing",
      ["00000000-0000-4000-8000-000000000010", key],
    );
    await db.query(
      "insert into bridge_delivery_jobs values ($1,'film-1','human_qc','requested','studio-a',$2) on conflict (requested_by,idempotency_key) do nothing",
      ["00000000-0000-4000-8000-000000000011", key],
    );
    const rows = await db.query("select id from bridge_delivery_jobs");
    assert.equal(rows.rows.length, 1);
    assert.match(source, /on conflict \(requested_by, idempotency_key\)[\s\S]*?do nothing/);
  } finally {
    await db.close();
  }
});

test("vendor assignment and completion require internal delivery authorization and finished-film titles", () => {
  const assignStart = source.indexOf("export const assignBridgeDeliveryJob");
  const completeStart = source.indexOf("export const completeBridgeDeliveryJob");
  const approveStart = source.indexOf("export const approveBridgeDeliveryJob");
  assert.ok(assignStart >= 0 && completeStart > assignStart && approveStart > completeStart);
  const assign = source.slice(assignStart, completeStart);
  const complete = source.slice(completeStart, source.indexOf("async function getFinalDeliveryReadiness", completeStart));
  assert.match(assign, /assertPermission\(actor, "title\.deliver"\)/);
  assert.match(assign, /if \(!actor\.internalRole\)/);
  assert.match(assign, /t\.submission_type='finished_film'/);
  assert.match(complete, /assertPermission\(actor, "title\.deliver"\)/);
  assert.match(complete, /if \(!actor\.internalRole\)/);
  assert.match(complete, /verifyObjectSha256/);
  assert.match(complete, /t\.submission_type='finished_film'/);
});

test("only Super Admin can sign off and sign-off never changes title lifecycle", () => {
  const start = source.indexOf("export const approveBridgeDeliveryJob");
  const signoff = source.slice(start);
  assert.match(signoff, /actor\.internalRole !== "super_admin"/);
  assert.match(signoff, /assertPermission\(actor, "loop\.publish"\)/);
  assert.match(signoff, /receipt_verified_at/);
  assert.match(signoff, /getFinalDeliveryReadiness/);
  assert.doesNotMatch(signoff, /`\s*update\s+bridge_titles/i);
});

test("final delivery readiness checks current-asset QC, independent Legal, valid rights, packaging and delivery gate", () => {
  const start = source.indexOf("async function getFinalDeliveryReadiness");
  const end = source.indexOf("export const approveBridgeDeliveryJob", start);
  const readiness = source.slice(start, end);
  assert.match(readiness, /reviewer_findings->0->>'masterKey'/);
  assert.match(readiness, /reviewer_findings->0->>'posterKey'/);
  assert.match(readiness, /l\.status='APPROVED'/);
  assert.match(readiness, /rg\.status='VALID'/);
  assert.match(readiness, /ott_preparation_status='READY'/);
  assert.match(readiness, /packaging_status='COMPLETE'/);
  assert.match(readiness, /curation_status='APPROVED'/);
  assert.match(readiness, /delivery_status='READY'/);
  assert.match(readiness, /readiness_state in \\('READY','AUTHORIZED'\\)/);
  assert.match(readiness, /p\.rights_grant_id/);
  assert.match(readiness, /p\.qc_case_id/);
  assert.match(readiness, /p\.legal_case_id/);
  assert.match(readiness, /g\.delivery_status='READY'/);
});

test("missing Delivery Desk table errors are sanitized and expose a retryable reference", async () => {
  const db = new PGlite();
  try {
    await assert.rejects(
      db.query("select * from bridge_delivery_jobs"),
      (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01"),
    );
    assert.match(source, /diagnostic\?\.code === "42P01"/);
    assert.match(source, /Vendor Jobs schema is unavailable/);
    assert.match(source, /Reference: \$\{reference\}/);
  } finally {
    await db.close();
  }
});

test("vendor completion verifies a private PDF object, exact byte size and SHA-256", () => {
  const start = source.indexOf("export const completeBridgeDeliveryJob");
  const end = source.indexOf("async function getFinalDeliveryReadiness", start);
  const completion = source.slice(start, end);
  assert.match(completion, /isValidVendorReceiptKey/);
  assert.match(completion, /verifyObject\(data\.receiptObjectKey, "application\/pdf"\)/);
  assert.match(completion, /verifyObjectSha256/);
  assert.match(completion, /receipt_verified_at=now\(\)/);
  assert.match(completion, /receipt_verified_by=\$\{actor\.userId\}/);
});


test("Delivery Desk evidence migration replays additively and preserves pre-existing job state", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table bridge_delivery_jobs (
        id uuid primary key,
        title_id text not null,
        job_type text not null,
        status text not null,
        assigned_vendor text,
        delivery_receipt_url text,
        admin_sign_off boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        requested_by text,
        request_note text
      );
      insert into bridge_delivery_jobs
        (id,title_id,job_type,status,admin_sign_off)
      values
        ('00000000-0000-4000-8000-000000000001','film-1','dcp','completed',false);
    `);
    const migration = readFileSync(
      new URL("../../../supabase/migrations/20261121220000_bridge_delivery_job_idempotency_evidence.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const columns = await db.query(
      "select column_name from information_schema.columns where table_name='bridge_delivery_jobs'",
    );
    const names = new Set(columns.rows.map((row) => row.column_name));
    for (const name of ["idempotency_key","receipt_object_key","receipt_sha256","receipt_byte_size","receipt_verified_at","receipt_verified_by"]) {
      assert.equal(names.has(name), true, name);
    }
    const indexes = await db.query(
      "select indexname from pg_indexes where tablename='bridge_delivery_jobs'",
    );
    assert.ok(indexes.rows.some((row) => row.indexname === "bridge_delivery_jobs_request_idempotency_idx"));
    const preserved = await db.query(
      "select status,admin_sign_off from bridge_delivery_jobs where title_id='film-1'",
    );
    assert.deepEqual(preserved.rows[0], { status: "completed", admin_sign_off: false });
  } finally {
    await db.close();
  }
});
