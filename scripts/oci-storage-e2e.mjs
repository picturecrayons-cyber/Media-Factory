#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  validateStorageE2EAsset,
  validateStorageE2EConfig,
} from "./oci-storage-e2e-guard.mjs";

const config = validateStorageE2EConfig(process.env);
if (!config.ok) {
  console.error(`STORAGE_E2E_BLOCKED ${config.reason}`);
  process.exit(2);
}

const { signUpload, verifyObject, sealVerifiedObject, signDownload } =
  await import("../src/lib/bridge/oci-object-storage.server.ts");
const { persistVerifiedAsset } =
  await import("../src/lib/bridge/asset-confirmation.ts");

const assetId = process.env.BRIDGE_E2E_ASSET_ID;
const titleId = process.env.BRIDGE_E2E_TITLE_ID;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

const payload = Buffer.from(
  "CRAYONS_BRIDGE_STAGING_STORAGE_E2E " + new Date().toISOString() + " " + randomUUID(),
  "utf8",
);

try {
  const result = await pool.query(
    `select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.created_by,
            a.byte_size, t.name as title_name, t.status, t.owner_user_id
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1 and t.id = $2
      limit 1`,
    [assetId, titleId],
  );
  const asset = result.rows[0];
  const assetCheck = validateStorageE2EAsset(asset, titleId);
  if (!assetCheck.ok) throw new Error(assetCheck.reason);

  console.log("1/6 approved synthetic STAGING poster record: PASS");
  console.log("2/6 request OCI signed upload URL: START");
  const upload = await signUpload({
    key: asset.s3_key,
    contentType: asset.content_type || "application/octet-stream",
  });
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": asset.content_type || "application/octet-stream" },
    body: payload,
  });
  if (!put.ok) throw new Error("OCI PUT failed (" + put.status + ")");
  console.log("2/6 request OCI signed upload URL + PUT: PASS");

  console.log("3/6 OCI HEAD/ETag verification: START");
  const verified = await verifyObject(asset.s3_key, asset.content_type);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag);
  console.log("3/6 OCI HEAD/ETag verification: PASS");

  const sealedKey = asset.s3_key + ".verified/" + randomUUID();
  console.log("4/6 immutable OCI seal: START");
  const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, verified.byteSize);
  assert.ok(sealed.etag);
  console.log("4/6 immutable OCI seal: PASS");

  console.log("5/6 Bridge persisted synthetic asset state + audit: START");
  const sql = {
    query: async (query, params) => (await pool.query(query, params)).rows,
  };
  const persisted = await persistVerifiedAsset(sql, {
    assetId: asset.id,
    actorUserId: asset.created_by,
    internalActor: false,
    titleId: asset.title_id,
    kind: asset.kind,
    byteSize: sealed.byteSize,
    contentType: sealed.contentType,
    checksum: sealed.etag,
    sourceKey: asset.s3_key,
    sealedKey,
  });
  assert.equal(persisted, true);

  const state = await pool.query(
    `select a.s3_key, a.byte_size, a.content_type,
            exists (
              select 1 from bridge_audit_logs l
               where l.entity_id = a.id
                 and l.action = 'asset.upload_verified'
            ) as audited
       from bridge_assets a
      where a.id = $1 and a.title_id = $2`,
    [asset.id, titleId],
  );
  const persistedState = state.rows[0];
  assert.equal(persistedState.s3_key, sealedKey);
  assert.equal(Number(persistedState.byte_size), sealed.byteSize);
  assert.equal(persistedState.audited, true);
  console.log("5/6 Bridge persisted synthetic asset state + audit: PASS");

  console.log("6/6 signed download + byte verification: START");
  const download = await signDownload({ key: sealedKey });
  const get = await fetch(download.url);
  if (!get.ok) throw new Error("OCI signed GET failed (" + get.status + ")");
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload);
  console.log("6/6 signed download + byte verification: PASS");

  console.log(JSON.stringify({
    status: "PASS",
    environment: "STAGING",
    supabaseProjectRef: "jbymleftneggcgutlcqu",
    assetId: asset.id,
    titleId: asset.title_id,
    sourceKey: asset.s3_key,
    sealedKey,
    byteSize: sealed.byteSize,
    etag: sealed.etag,
    persisted: true,
    auditRecorded: true,
  }));
} catch (error) {
  console.error("STAGING_STORAGE_E2E_FAILED", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
