#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const required = [
  "OCI_TENANCY_OCID",
  "OCI_USER_OCID",
  "OCI_FINGERPRINT",
  "OCI_PRIVATE_KEY",
  "OCI_REGION",
  "OCI_NAMESPACE",
  "OCI_BUCKET_NAME",
  "DATABASE_URL",
  "BRIDGE_E2E_ASSET_ID",
  "BRIDGE_E2E_EXPECTED_DATABASE_HOST",
  "BRIDGE_E2E_NONPROD_CONFIRMATION",
];
const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length) {
  console.error(`STORAGE_E2E_BLOCKED missing: ${missing.join(", ")}`);
  process.exit(2);
}

if (process.env.BRIDGE_E2E_NONPROD_CONFIRMATION !== "I_CONFIRM_NON_PRODUCTION") {
  console.error("STORAGE_E2E_BLOCKED: non-production confirmation is not exact");
  process.exit(2);
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const expectedHost = process.env.BRIDGE_E2E_EXPECTED_DATABASE_HOST.trim().toLowerCase();
if (!expectedHost || databaseUrl.hostname.toLowerCase() !== expectedHost) {
  console.error("STORAGE_E2E_BLOCKED: DATABASE_URL host does not match the explicitly approved non-production host");
  process.exit(2);
}
if (!/(e2e|test|nonprod)/i.test(process.env.OCI_BUCKET_NAME)) {
  console.error("STORAGE_E2E_BLOCKED: OCI bucket name must clearly identify a test/non-production bucket");
  process.exit(2);
}

const { signUpload, verifyObject, sealVerifiedObject, signDownload, deleteObject } =
  await import("../src/lib/bridge/oci-object-storage.server.ts");
const { persistVerifiedAsset } =
  await import("../src/lib/bridge/asset-confirmation.ts");

const assetId = process.env.BRIDGE_E2E_ASSET_ID;
const runId = `${new Date().toISOString().replace(/[^0-9TZ]/g, "")}-${randomUUID()}`;
const sourceKey = `bridge-e2e/${runId}/upload.bin`;
const sealedKey = `bridge-e2e/${runId}/sealed.bin`;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});
let client;
let transactionOpen = false;
let storageConfigured = false;
const cleanupErrors = [];

async function independentlyVerifyDeleted(key) {
  try {
    await verifyObject(key);
    throw new Error(`OCI object still exists after deletion: ${key}`);
  } catch (error) {
    if (error instanceof Error && /OCI object verification failed \(404\)/.test(error.message)) {
      console.log(`CLEANUP_HEAD_404 PASS: ${key}`);
      return;
    }
    throw error;
  }
}

async function cleanupObject(key) {
  if (!storageConfigured) return;
  try {
    await deleteObject(key);
    await independentlyVerifyDeleted(key);
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error.message : String(error));
  }
}

try {
  // Never commit test DB changes: the transaction makes persistence/audit checks
  // visible to this test only and rollback restores the fixture's original state.
  client = await pool.connect();
  await client.query("BEGIN");
  transactionOpen = true;

  const result = await client.query(
    `select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.created_by,
            a.byte_size, t.status, t.owner_user_id
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1
      limit 1`,
    [assetId],
  );
  const asset = result.rows[0];
  if (!asset) throw new Error("E2E fixture asset not found");
  if (asset.byte_size !== null) throw new Error("E2E fixture asset is already verified; use a fresh pending fixture");
  if (!["DRAFT", "UPLOADING", "PREPARING"].includes(asset.status)) {
    throw new Error(`E2E fixture title is not uploadable: ${asset.status}`);
  }
  assert.equal(asset.created_by, asset.owner_user_id, "E2E fixture asset must belong to the title owner");

  // Point the pending fixture at a unique key only inside the rollback-only
  // transaction, so the persistence function's source-key compare-and-set remains valid.
  const staged = await client.query(
    "update bridge_assets set s3_key = $1 where id = $2 and byte_size is null returning id",
    [sourceKey, asset.id],
  );
  if (staged.rowCount !== 1) throw new Error("Could not stage disposable pending fixture");
  console.log("1/6 pending fixture staged in rollback-only transaction: PASS");

  storageConfigured = true;
  const payload = Buffer.from(`CRAYONS_BRIDGE_STORAGE_E2E ${runId}`, "utf8");
  const contentType = asset.content_type || "application/octet-stream";

  console.log("2/6 unique OCI upload: START");
  const upload = await signUpload({ key: sourceKey, contentType });
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: payload,
  });
  if (!put.ok) throw new Error(`OCI PUT failed (${put.status})`);
  console.log("2/6 unique OCI upload: PASS");

  console.log("3/6 OCI HEAD/ETag verification: START");
  const verified = await verifyObject(sourceKey, contentType);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag);
  console.log("3/6 OCI HEAD/ETag verification: PASS");

  console.log("4/6 unique sealed object: START");
  const sealed = await sealVerifiedObject(sourceKey, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, verified.byteSize);
  assert.ok(sealed.etag);
  console.log("4/6 unique sealed object: PASS");

  console.log("5/6 Bridge persistence + audit verification: START");
  const sql = { query: async (query, params) => (await client.query(query, params)).rows };
  const persisted = await persistVerifiedAsset(sql, {
    assetId: asset.id,
    actorUserId: asset.created_by,
    internalActor: false,
    titleId: asset.title_id,
    kind: asset.kind,
    byteSize: sealed.byteSize,
    contentType: sealed.contentType,
    checksum: sealed.etag,
    sourceKey,
    sealedKey,
  });
  assert.equal(persisted, true);
  const state = await client.query(
    `select a.s3_key, a.byte_size, a.content_type,
            t.poster_key, t.master_key,
            exists (
              select 1 from bridge_audit_logs l
               where l.entity_id = a.id
                 and l.action = 'asset.upload_verified'
                 and l.metadata->>'checksum' = $2
            ) as audited
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1`,
    [asset.id, sealed.etag],
  );
  const persistedState = state.rows[0];
  assert.equal(persistedState.s3_key, sealedKey);
  assert.equal(Number(persistedState.byte_size), sealed.byteSize);
  assert.equal(persistedState.audited, true);
  console.log("5/6 Bridge persistence + audit verification: PASS (uncommitted transaction)");

  console.log("6/6 signed GET + byte-for-byte verification: START");
  const download = await signDownload({ key: sealedKey });
  const get = await fetch(download.url);
  if (!get.ok) throw new Error(`OCI signed GET failed (${get.status})`);
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload);
  console.log("6/6 signed GET + byte-for-byte verification: PASS");

  console.log(JSON.stringify({
    status: "ROUND_TRIP_PASS_PENDING_CLEANUP",
    runId,
    assetId: asset.id,
    titleId: asset.title_id,
    byteSize: sealed.byteSize,
    persistedWithinTransaction: true,
    auditRecordedWithinTransaction: true,
  }));
} catch (error) {
  console.error("STORAGE_E2E_FAILED", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (transactionOpen && client) {
    try {
      await client.query("ROLLBACK");
      transactionOpen = false;
      console.log("DATABASE_ROLLBACK PASS");
    } catch (error) {
      cleanupErrors.push(`database rollback failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
  client?.release();
  await cleanupObject(sealedKey);
  await cleanupObject(sourceKey);
  await pool.end();
  if (cleanupErrors.length) {
    console.error("STORAGE_E2E_CLEANUP_FAILED", cleanupErrors.join(" | "));
    process.exitCode = 1;
  } else if (storageConfigured) {
    console.log("STORAGE_E2E_CLEANUP PASS: rollback + independent HEAD 404 for unique objects");
  }
}
