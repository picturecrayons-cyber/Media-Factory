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

const { signUpload, verifyObject, sealVerifiedObject, signDownload, deleteObject } =
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
const startedAt = new Date();
const createdKeys = [];
let snapshot = null;
let sealedKey = null;

function redact(value) {
  return String(value ?? "").replace(/https?:\/\/\S+/g, "[redacted-url]");
}

async function cleanup() {
  const errors = [];
  for (const key of [...createdKeys].reverse()) {
    try {
      await deleteObject(key);
      console.log("CLEANUP sealed object deleted");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (snapshot && sealedKey) {
    const reverted = await pool.query(
      `update bridge_assets
          set byte_size = null,
              s3_key = $2,
              content_type = $3
        where id = $1
          and s3_key = $4
          and byte_size is not null
        returning id`,
      [snapshot.id, snapshot.s3_key, snapshot.content_type, sealedKey],
    );
    if (snapshot.kind === "poster" || snapshot.kind === "master") {
      const column = snapshot.kind === "poster" ? "poster_key" : "master_key";
      await pool.query(
        `update bridge_titles
            set ${column} = case when ${column} = $2 then $3 else ${column} end,
                updated_at = now()
          where id = $1`,
        [snapshot.title_id, sealedKey, snapshot.title_key],
      );
    }
    console.log(`CLEANUP asset revert rows=${reverted.rowCount}`);
  }
  if (errors.length) throw new Error(`CLEANUP_INCOMPLETE ${errors.map(redact).join("; ")}`);
}

try {
  const result = await pool.query(
    `select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.created_by,
            a.byte_size, t.status, t.owner_user_id,
            case when a.kind = 'poster' then t.poster_key
                 when a.kind = 'master' then t.master_key
                 else null end as title_key
       from bridge_assets a
       join bridge_titles t on t.id = a.title_id
      where a.id = $1
      limit 1`,
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

  console.log("1/6 pending Bridge asset record: PASS");
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

  const verified = await verifyObject(asset.s3_key, asset.content_type);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag);
  console.log("3/6 OCI HEAD/ETag verification: PASS");

  sealedKey = `${asset.s3_key}.verified/${randomUUID()}`;
  const sealed = await sealVerifiedObject(asset.s3_key, sealedKey, verified.etag);
  createdKeys.push(sealedKey);
  assert.equal(sealed.byteSize, verified.byteSize);
  assert.ok(sealed.etag);
  console.log("4/6 copy seal: PASS (not OCI retention)");

  const sql = { query: async (query, params) => (await pool.query(query, params)).rows };
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
    `select a.s3_key, a.byte_size,
            exists (
              select 1 from bridge_audit_logs l
               where l.entity_id = a.id
                 and l.action = 'asset.upload_verified'
                 and l.created_at >= $2
            ) as audited
       from bridge_assets a
      where a.id = $1`,
    [asset.id, startedAt.toISOString()],
  );
  assert.equal(state.rows[0].s3_key, sealedKey);
  assert.equal(Number(state.rows[0].byte_size), sealed.byteSize);
  assert.equal(state.rows[0].audited, true);
  console.log("5/6 Bridge persisted asset state + audit: PASS");

  const download = await signDownload({ key: sealedKey });
  const get = await fetch(download.url);
  if (!get.ok) throw new Error(`OCI signed GET failed (${get.status})`);
  const downloaded = Buffer.from(await get.arrayBuffer());
  assert.deepEqual(downloaded, payload);
  console.log("6/6 signed download + byte verification: PASS");

  await cleanup();
  const after = await pool.query(
    `select s3_key, byte_size from bridge_assets where id = $1`,
    [asset.id],
  );
  assert.equal(after.rows[0].s3_key, snapshot.s3_key);
  assert.equal(after.rows[0].byte_size, null);
  console.log(JSON.stringify({
    status: "PASS",
    assetId: asset.id,
    titleId: asset.title_id,
    byteSize: sealed.byteSize,
    persisted: true,
    auditRecorded: true,
    auditPreserved: true,
    fixtureKeyPreserved: true,
    cleanedSealedCopy: true,
  }));
} catch (error) {
  console.error("STORAGE_E2E_FAILED", redact(error instanceof Error ? error.message : String(error)));
  try { await cleanup(); } catch (cleanupError) {
    console.error("CLEANUP_FAILED", redact(cleanupError instanceof Error ? cleanupError.message : String(cleanupError)));
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
