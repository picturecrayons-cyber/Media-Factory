#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { cleanupOciE2E } from "./oci-storage-e2e-cleanup.mjs";

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
];

const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length) {
  console.error(`STORAGE_E2E_BLOCKED missing: ${missing.join(", ")}`);
  process.exit(2);
}

const { signUpload, verifyObject, sealVerifiedObject, signDownload, deleteObject, objectExists } =
  await import("../src/lib/bridge/oci-object-storage.server.ts");
const { persistVerifiedAsset } =
  await import("../src/lib/bridge/asset-confirmation.ts");

const assetId = process.env.BRIDGE_E2E_ASSET_ID;
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});
const runId = randomUUID();
const safeAssetId = String(assetId).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
const runPrefix = `bridge-e2e/${safeAssetId}/${runId}`;
const sourceKey = `${runPrefix}/source.bin`;
const sealedKey = `${runPrefix}/sealed.bin`;
// Register both unique keys before network I/O. Deletes of nonexistent keys are idempotent.
const runKeys = [sourceKey, sealedKey];
const payload = Buffer.from(
  `CRAYONS_BRIDGE_STORAGE_E2E ${new Date().toISOString()} ${runId}`,
  "utf8",
);
const startedAt = new Date();

let connected = false;
let transactionOpen = false;
let snapshot = null;
let runResult = null;
let runError = null;

function redact(value) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/g, "[redacted-url]")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[redacted-key]");
}

async function readFixtureState(id) {
  return client.query(
    `select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.created_by,
            a.byte_size, t.status, t.owner_user_id, t.poster_key, t.master_key,
            t.updated_at as title_updated_at
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1
      limit 1`,
    [id],
  );
}

function assertFixtureRestored(before, after) {
  assert.ok(after, "fixture row must still exist after rollback");
  for (const key of [
    "id", "title_id", "kind", "s3_key", "content_type", "created_by",
    "byte_size", "status", "owner_user_id", "poster_key", "master_key",
  ]) {
    assert.deepEqual(after[key], before[key], `fixture field ${key} must be restored`);
  }
  assert.equal(
    new Date(after.title_updated_at).toISOString(),
    new Date(before.title_updated_at).toISOString(),
    "title updated_at must be restored",
  );
}

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  transactionOpen = true;

  const result = await client.query(
    `select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.created_by,
            a.byte_size, t.status, t.owner_user_id, t.poster_key, t.master_key,
            t.updated_at as title_updated_at
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1
      limit 1
      for update of a, t`,
    [assetId],
  );
  const asset = result.rows[0];
  if (!asset) throw new Error("E2E asset not found");
  if (asset.byte_size !== null) throw new Error("E2E asset is already verified; provide a fresh pending asset");
  if (!["DRAFT", "UPLOADING", "PREPARING"].includes(asset.status)) {
    throw new Error(`E2E title is not uploadable: ${asset.status}`);
  }
  assert.equal(asset.created_by, asset.owner_user_id, "E2E asset must belong to the title owner");
  snapshot = asset;

  console.log("1/6 locked pending fixture row: PASS");
  const contentType = asset.content_type || "application/octet-stream";
  const upload = await signUpload({ key: sourceKey, contentType });
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: payload,
  });
  if (!put.ok) throw new Error(`OCI PUT failed (${put.status})`);
  console.log("2/6 run-unique OCI PUT: PASS");

  const movedToRunKey = await client.query(
    `update bridge_assets
        set s3_key = $2
      where id = $1
        and s3_key = $3
        and byte_size is null
      returning id`,
    [asset.id, sourceKey, asset.s3_key],
  );
  assert.equal(movedToRunKey.rowCount, 1, "fixture source-key compare-and-set must update exactly one row");

  const verified = await verifyObject(sourceKey, contentType);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag);
  console.log("3/6 OCI HEAD/ETag verification: PASS");

  const sealed = await sealVerifiedObject(sourceKey, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, verified.byteSize);
  assert.ok(sealed.etag);
  console.log("4/6 verified OCI copy: PASS (copy is not OCI retention)");

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
    `select a.s3_key, a.byte_size, a.content_type, t.poster_key, t.master_key,
            exists (
              select 1 from bridge_audit_logs l
               where l.entity_id = a.id
                 and l.action = 'asset.upload_verified'
                 and l.created_at >= $2
                 and l.metadata->>'checksum' = $3
            ) as audited
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1`,
    [asset.id, startedAt.toISOString(), sealed.etag],
  );
  const persistedState = state.rows[0];
  assert.ok(persistedState, "persisted asset state must be queryable");
  assert.equal(persistedState.s3_key, sealedKey);
  assert.equal(Number(persistedState.byte_size), sealed.byteSize);
  assert.equal(persistedState.audited, true, "audit event must exist inside the test transaction");
  if (asset.kind === "poster") assert.equal(persistedState.poster_key, sealedKey);
  else assert.equal(persistedState.poster_key, asset.poster_key);
  if (asset.kind === "master") assert.equal(persistedState.master_key, sealedKey);
  else assert.equal(persistedState.master_key, asset.master_key);
  console.log("5/6 Bridge state + in-transaction audit: PASS");

  const download = await signDownload({ key: sealedKey });
  const get = await fetch(download.url);
  if (!get.ok) throw new Error(`OCI signed GET failed (${get.status})`);
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload);
  console.log("6/6 signed download + bytes: PASS");

  runResult = {
    status: "PASS",
    assetId: asset.id,
    titleId: asset.title_id,
    byteSize: sealed.byteSize,
    persistedInsideTransaction: true,
    auditObservedWithinTransaction: true,
    databaseTransactionRolledBack: true,
    fixtureStateVerifiedAfterRollback: true,
    runOwnedObjectsDeletedAndAbsent: true,
  };
} catch (error) {
  runError = error instanceof Error ? error : new Error(String(error));
  console.error("STORAGE_E2E_FAILED", redact(runError.message));
  process.exitCode = 1;
} finally {
  if (connected) {
    try {
      await cleanupOciE2E({
        runKeys,
        deleteObject,
        objectExists,
        rollback: async () => {
          if (transactionOpen) {
            await client.query("ROLLBACK");
            transactionOpen = false;
          }
        },
        verifyDatabaseState: snapshot
          ? async () => {
              const after = await readFixtureState(snapshot.id);
              assertFixtureRestored(snapshot, after.rows[0]);
            }
          : undefined,
      });
      console.log("CLEANUP_PASS: both run-owned objects absent; DB transaction rolled back; fixture fields restored");
    } catch (cleanupError) {
      console.error(
        "CLEANUP_FAILED",
        redact(cleanupError instanceof Error ? cleanupError.message : String(cleanupError)),
      );
      process.exitCode = 1;
    }
    try {
      await client.end();
    } catch (closeError) {
      console.error("DATABASE_CLOSE_FAILED", redact(closeError instanceof Error ? closeError.message : String(closeError)));
      process.exitCode = 1;
    }
  } else {
    process.exitCode = 1;
  }
}

if (runResult && process.exitCode !== 1) {
  console.log(JSON.stringify(runResult));
}
