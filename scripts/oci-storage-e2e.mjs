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
];

const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length) {
  console.error(`STORAGE_E2E_BLOCKED missing: ${missing.join(", ")}`);
  process.exit(2);
}

const { signUpload, verifyObject, sealVerifiedObject, signDownload } =
  await import("../src/lib/bridge/oci-object-storage.server.ts");
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
try {
  const result = await pool.query(
    `select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.created_by,
            a.byte_size, t.status, t.owner_user_id
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1
      limit 1`,
    [assetId],
  );
  asset = result.rows[0];
  if (!asset) throw new Error("E2E asset not found");
  if (asset.byte_size !== null) throw new Error("E2E asset is already verified; provide a fresh pending asset");
  if (!["DRAFT", "UPLOADING", "PREPARING"].includes(asset.status)) {
    throw new Error(`E2E title is not uploadable: ${asset.status}`);
  }
  assert.equal(asset.created_by, asset.owner_user_id, "E2E asset must belong to the title owner");

  console.log("1/6 pending Bridge asset record: PASS");
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
  if (!put.ok) throw new Error(`OCI PUT failed (${put.status})`);
  console.log("2/6 request OCI signed upload URL + PUT: PASS");

  console.log("3/6 OCI HEAD/ETag verification: START");
  const verified = await verifyObject(asset.s3_key, asset.content_type);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag);
  console.log("3/6 OCI HEAD/ETag verification: PASS");

  const sealedKey = `${asset.s3_key}.verified/${randomUUID()}`;
  console.log("4/6 immutable OCI seal: START");
  const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, verified.byteSize);
  assert.ok(sealed.etag);
  console.log("4/6 immutable OCI seal: PASS");

  console.log("5/6 Bridge persisted asset state + audit: START");
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
    sourceKey: asset.s3_key,
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
  await pool.end();
}
