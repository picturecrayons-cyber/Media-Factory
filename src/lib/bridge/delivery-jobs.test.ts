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
  assert.match(readiness, /g\.packaging_status='COMPLETE'/);
  assert.match(readiness, /g\.delivery_status='READY'/);
});
