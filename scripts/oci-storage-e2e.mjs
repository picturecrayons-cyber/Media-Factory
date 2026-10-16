#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

import {
  errorText,
  requireEnvironment,
  requireExplicitFlag,
  requirePreviewDatabase,
} from "./oci-e2e-safety.mjs";

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

let databaseUrl;
try {
  requireExplicitFlag(
    "--confirm-mutable",
    "database-writing storage E2E requires a disposable Preview fixture and an approved cleanup plan",
  );
  requireEnvironment(required);
  databaseUrl = requirePreviewDatabase(process.env.DATABASE_URL);
} catch (error) {
  console.error("STORAGE_E2E_BLOCKED", errorText(error));
  process.exit(2);
}

const {
  deleteObject,
  signUpload,
  verifyObject,
  sealVerifiedObject,
  signDownload,
} = await import("../src/lib/bridge/oci-object-storage.server.ts");
const { persistVerifiedAsset } =
  await import("../src/lib/bridge/asset-confirmation.ts");

const assetId = process.env.BRIDGE_E2E_ASSET_ID;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

const payload = Buffer.from(
  `CRAYONS_BRIDGE_STORAGE_E2E ${new Date().toISOString()} ${randomUUID()}`,
  "utf8",
);

let asset;
let sourceKey;
let sealedKey;
let persisted = false;
let persistenceAttempted = false;
try {
  const result = await pool.query(
    `select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.created_by,
            a.byte_size, a.created_at as asset_created_at,
            t.status, t.owner_user_id, t.slug, t.name,
            t.created_at as title_created_at
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1
      limit 1`,
    [assetId],
  );
  asset = result.rows[0];
  if (!asset) throw new Error("E2E asset not found");
  if (asset.byte_size !== null) throw new Error("E2E asset is already verified; provide a fresh pending asset");
  if (!String(asset.slug ?? "").startsWith("internal-oci-storage-e2e-")) {
    throw new Error("E2E asset must belong to a dedicated internal-oci-storage-e2e-* title; refusing customer or production titles");
  }
  if (!String(asset.name ?? "").toUpperCase().startsWith("INTERNAL TEST ONLY")) {
    throw new Error("E2E title name must start with 'INTERNAL TEST ONLY'.");
  }
  if (!["DRAFT", "UPLOADING", "PREPARING"].includes(asset.status)) {
    throw new Error(`E2E title is not uploadable: ${asset.status}`);
  }
  assert.equal(asset.created_by, asset.owner_user_id, "E2E asset must belong to the title owner");

  const freshCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const titleCreatedAt = Date.parse(String(asset.title_created_at ?? ""));
  const assetCreatedAt = Date.parse(String(asset.asset_created_at ?? ""));
  if (!Number.isFinite(titleCreatedAt) || titleCreatedAt < freshCutoff) {
    throw new Error("E2E title must have been created within the last 24 hours; provision a fresh disposable Preview fixture.");
  }
  if (!Number.isFinite(assetCreatedAt) || assetCreatedAt < freshCutoff) {
    throw new Error("E2E asset must have been created within the last 24 hours; provision a fresh pending asset.");
  }

  // Use a unique source key so retries never overwrite the fixture's old object.
  sourceKey = `${asset.s3_key}.e2e-source/${randomUUID()}`;

  console.log("1/6 pending Bridge asset record: PASS");
  console.log("2/6 request OCI signed upload URL: START");
  const upload = await signUpload({
    key: sourceKey,
    contentType: asset.content_type || "application/octet-stream",
  });
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": asset.content_type || "application/octet-stream" },
    body: payload,
  });
  if (!put.ok) throw new Error(`OCI PUT failed (${put.status})`);
  console.log("2/6 request OCI signed upload URL + PUT: PASS");

  console.log("3/6 OCI HEAD/ETag verification: START");
  const verified = await verifyObject(sourceKey, asset.content_type);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag);
  console.log("3/6 OCI HEAD/ETag verification: PASS");

  sealedKey = `${asset.s3_key}.verified-e2e/${randomUUID()}`;
  console.log("4/6 immutable OCI seal: START");
  const sealed = await sealVerifiedObject(sourceKey, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, verified.byteSize);
  assert.ok(sealed.etag);
  console.log("4/6 immutable OCI seal: PASS");

  console.log("5/6 Bridge persisted asset state + audit: START");
  const sql = {
    query: async (query, params) => (await pool.query(query, params)).rows,
  };
  // From this point onward the helper may write an asset key/audit row even if
  // a later assertion or return path fails. Do not auto-delete a possibly-referenced sealed object.
  persistenceAttempted = true;
  const wasPersisted = await persistVerifiedAsset(sql, {
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
  assert.equal(wasPersisted, true);
  persisted = true;

  const state = await pool.query(
    `select a.s3_key, a.byte_size, a.content_type,
            t.poster_key, t.master_key,
            exists (
              select 1 from bridge_audit_logs l
               where l.entity_id = a.id
                 and l.action = 'asset.upload_verified'
            ) as audited
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1`,
    [asset.id],
  );
  const persistedState = state.rows[0];
  assert.equal(persistedState.s3_key, sealedKey);
  assert.equal(Number(persistedState.byte_size), sealed.byteSize);
  assert.equal(persistedState.audited, true);
  console.log("5/6 Bridge persisted asset state + audit: PASS");

  console.log("6/6 signed download + byte verification: START");
  const download = await signDownload({ key: sealedKey });
  const get = await fetch(download.url);
  if (!get.ok) throw new Error(`OCI signed GET failed (${get.status})`);
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload);
  console.log("6/6 signed download + byte verification: PASS");

  console.log(JSON.stringify({
    status: "PASS",
    assetId: asset.id,
    titleId: asset.title_id,
    sourceKey,
    sealedKey,
    byteSize: sealed.byteSize,
    etag: sealed.etag,
    persisted: true,
    auditRecorded: true,
  }));
} catch (error) {
  console.error("STORAGE_E2E_FAILED", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  // Once persisted, the sealed object is now referenced by the asset and must
  // not be deleted automatically. Before persistence, clean only keys created
  // by this run; failures to clean are reported for manual operator cleanup.
  const cleanupErrors = [];
  if (!persistenceAttempted && sealedKey) {
    try {
      await deleteObject(sealedKey);
    } catch (error) {
      cleanupErrors.push(`sealed object ${sealedKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (sourceKey) {
    try {
      await deleteObject(sourceKey);
    } catch (error) {
      cleanupErrors.push(`source object ${sourceKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (persistenceAttempted && !persisted) {
    console.error(`STORAGE_E2E_PERSISTENCE_STATE_UNKNOWN asset=${assetId} sealedKey=${sealedKey ?? "not-created"}; inspect database before manual cleanup`);
    process.exitCode = 1;
  }
  if (cleanupErrors.length) {
    console.error(`STORAGE_E2E_CLEANUP_REQUIRED ${cleanupErrors.join("; ")}`);
    process.exitCode = 1;
  }
  await pool.end();
}
