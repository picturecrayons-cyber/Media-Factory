#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const required = [
  "OCI_TENANCY_OCID", "OCI_USER_OCID", "OCI_FINGERPRINT", "OCI_PRIVATE_KEY",
  "OCI_REGION", "OCI_NAMESPACE", "OCI_BUCKET_NAME", "DATABASE_URL",
  "BRIDGE_E2E_ASSET_ID",
];
const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
if (missing.length) {
  console.error(`STORAGE_E2E_BLOCKED missing: ${missing.join(", ")}`);
  process.exit(2);
}

const {
  signUpload, objectExists, verifyObject, sealVerifiedObject, signDownload, deleteObject,
} = await import("../src/lib/bridge/oci-object-storage.server.ts");
const { persistVerifiedAsset } = await import("../src/lib/bridge/asset-confirmation.ts");

const assetId = process.env.BRIDGE_E2E_ASSET_ID;
const runId = randomUUID();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});
const payload = Buffer.from(`CRAYONS_BRIDGE_STORAGE_E2E ${new Date().toISOString()} ${runId}`, "utf8");
const startedAt = new Date();
const createdKeys = [];
let snapshot = null;
let sourceKey = null;
let sealedKey = null;
let expectedPersistedContentType = null;
let persistedByteSize = null;
let persisted = false;

function redact(value) {
  return String(value ?? "").replace(/https?:\/\/\S+/g, "[redacted-url]");
}

async function assertOriginalDatabaseState(client = pool) {
  if (!snapshot) return;
  const state = await client.query(
    `select a.id, a.s3_key, a.byte_size, a.content_type, t.poster_key, t.master_key
       from bridge_assets a join bridge_titles t on t.id = a.title_id
      where a.id = $1`,
    [snapshot.id],
  );
  const row = state.rows[0];
  if (!row) throw new Error("E2E asset disappeared during cleanup");
  assert.equal(row.s3_key, snapshot.s3_key, "asset key was not restored");
  assert.equal(row.byte_size, snapshot.byte_size, "asset byte_size was not restored");
  assert.equal(row.content_type, snapshot.content_type, "asset content_type was not restored");
  if (snapshot.kind === "poster") assert.equal(row.poster_key, snapshot.title_key, "poster pointer was not restored");
  if (snapshot.kind === "master") assert.equal(row.master_key, snapshot.title_key, "master pointer was not restored");
}

async function rollbackDatabase() {
  if (!snapshot || !sealedKey) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `select a.id, a.s3_key, a.byte_size, a.content_type,
              case when a.kind = 'poster' then t.poster_key
                   when a.kind = 'master' then t.master_key
                   else null end as title_key
         from bridge_assets a join bridge_titles t on t.id = a.title_id
        where a.id = $1
        for update of a, t`,
      [snapshot.id],
    );
    const current = locked.rows[0];
    if (!current) throw new Error("E2E asset disappeared; refusing database rollback");

    const isOriginal =
      current.s3_key === snapshot.s3_key &&
      current.byte_size === snapshot.byte_size &&
      current.content_type === snapshot.content_type;
    const isPersisted =
      current.s3_key === sealedKey &&
      Number(current.byte_size) === persistedByteSize &&
      current.content_type === expectedPersistedContentType;

    if (isOriginal) {
      if (snapshot.kind === "poster" || snapshot.kind === "master") {
        assert.equal(current.title_key, snapshot.title_key, "title pointer changed unexpectedly");
      }
      await client.query("COMMIT");
      return;
    }
    if (!isPersisted || !persisted) {
      throw new Error("CAS rollback refused: asset state no longer matches this E2E run");
    }

    const assetRestore = await client.query(
      `update bridge_assets
          set s3_key = $2, byte_size = $3, content_type = $4
        where id = $1 and s3_key = $5 and byte_size = $6
          and content_type is not distinct from $7
        returning id`,
      [
        snapshot.id, snapshot.s3_key, snapshot.byte_size, snapshot.content_type,
        sealedKey, persistedByteSize, expectedPersistedContentType,
      ],
    );
    if (assetRestore.rowCount !== 1) throw new Error("CAS rollback refused: asset changed during cleanup");

    if (snapshot.kind === "poster" || snapshot.kind === "master") {
      const titleColumn = snapshot.kind === "poster" ? "poster_key" : "master_key";
      const titleRestore = await client.query(
        `update bridge_titles set ${titleColumn} = $2, updated_at = now()
          where id = $1 and ${titleColumn} = $3 returning id`,
        [snapshot.title_id, snapshot.title_key, sealedKey],
      );
      if (titleRestore.rowCount !== 1) throw new Error("CAS rollback refused: title pointer changed during cleanup");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanup() {
  // Restore DB references before deleting objects. If compare-and-set rollback
  // encounters a concurrent change, fail closed and retain objects potentially
  // referenced by the database.
  if (snapshot) {
    try {
      await rollbackDatabase();
      await assertOriginalDatabaseState();
    } catch (error) {
      throw new Error(`CLEANUP_INCOMPLETE database rollback: ${redact(error instanceof Error ? error.message : String(error))}`);
    }
  }
  const errors = [];
  for (const key of [...createdKeys].reverse()) {
    try {
      await deleteObject(key);
      if (await objectExists(key)) throw new Error("object still exists after delete");
      console.log(`CLEANUP object absent: ${key === sourceKey ? "run-owned source" : "run-owned sealed destination"}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
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
       from bridge_assets a join bridge_titles t on t.id = a.title_id
      where a.id = $1 limit 1`,
    [assetId],
  );
  const asset = result.rows[0];
  if (!asset) throw new Error("E2E asset not found");
  snapshot = asset;
  if (asset.byte_size !== null) throw new Error("E2E asset is already verified; provide a fresh pending asset");
  if (!["DRAFT", "UPLOADING", "PREPARING"].includes(asset.status)) {
    throw new Error(`E2E title is not uploadable: ${asset.status}`);
  }
  assert.equal(asset.created_by, asset.owner_user_id, "E2E asset must belong to the title owner");

  // Unique run-owned paths; the historical fixture key is read only. Confirm
  // absence first, then record both keys for cleanup before the first write.
  const runPrefix = `${asset.s3_key}.e2e/${runId}`;
  sourceKey = `${runPrefix}/source`;
  sealedKey = `${runPrefix}/sealed`;
  if (await objectExists(sourceKey)) throw new Error("Run-owned source key unexpectedly exists; refusing overwrite");
  if (await objectExists(sealedKey)) throw new Error("Run-owned sealed key unexpectedly exists; refusing overwrite");
  createdKeys.push(sourceKey, sealedKey);

  console.log("1/6 pending Bridge asset + unique run-owned keys: PASS");
  const contentType = asset.content_type || "application/octet-stream";
  const upload = await signUpload({ key: sourceKey, contentType });
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: payload,
  });
  if (!put.ok) throw new Error(`OCI PUT failed (${put.status})`);
  console.log("2/6 signed upload + PUT to unique source: PASS");

  const verified = await verifyObject(sourceKey, asset.content_type);
  assert.equal(verified.byteSize, payload.byteLength);
  assert.ok(verified.etag);
  console.log("3/6 OCI HEAD/ETag verification: PASS");

  const sealed = await sealVerifiedObject(sourceKey, sealedKey, verified.etag);
  assert.equal(sealed.byteSize, verified.byteSize);
  assert.ok(sealed.etag);
  console.log("4/6 copy seal: PASS (not OCI retention)");

  expectedPersistedContentType = sealed.contentType ?? asset.content_type;
  persistedByteSize = sealed.byteSize;
  const sql = { query: async (query, params) => (await pool.query(query, params)).rows };
  const didPersist = await persistVerifiedAsset(sql, {
    assetId: asset.id,
    actorUserId: asset.created_by,
    internalActor: false,
    titleId: asset.title_id,
    kind: asset.kind,
    byteSize: sealed.byteSize,
    contentType: sealed.contentType,
    checksum: sealed.etag,
    // Use the original pointer as the DB compare-and-set token. The actual
    // OCI source key is unique, so the historical object is never overwritten.
    sourceKey: asset.s3_key,
    sealedKey,
  });
  assert.equal(didPersist, true);
  persisted = true;

  const state = await pool.query(
    `select a.s3_key, a.byte_size, a.content_type,
            exists (
              select 1 from bridge_audit_logs l
               where l.entity_id = a.id and l.action = 'asset.upload_verified'
                 and l.created_at >= $2 and l.metadata->>'titleId' = $3
            ) as audited
       from bridge_assets a where a.id = $1`,
    [asset.id, startedAt.toISOString(), asset.title_id],
  );
  assert.equal(state.rows[0].s3_key, sealedKey);
  assert.equal(Number(state.rows[0].byte_size), sealed.byteSize);
  assert.equal(state.rows[0].content_type, expectedPersistedContentType);
  assert.equal(state.rows[0].audited, true);
  console.log("5/6 Bridge state + audit history: PASS");

  const download = await signDownload({ key: sealedKey });
  const get = await fetch(download.url);
  if (!get.ok) throw new Error(`OCI signed GET failed (${get.status})`);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), payload);
  console.log("6/6 signed download + byte-integrity: PASS");

  await cleanup();
  // Independent read-back after cleanup; do not infer cleanup success from
  // the cleanup procedure's own return values.
  await assertOriginalDatabaseState();
  for (const key of createdKeys) {
    assert.equal(await objectExists(key), false, `run-owned OCI object remains: ${key}`);
  }
  const auditCheck = await pool.query(
    `select count(*)::int as count from bridge_audit_logs
      where entity_id = $1 and action = 'asset.upload_verified'
        and created_at >= $2 and metadata->>'titleId' = $3`,
    [asset.id, startedAt.toISOString(), asset.title_id],
  );
  assert.ok(Number(auditCheck.rows[0].count) >= 1, "audit history was not preserved");
  console.log(JSON.stringify({
    status: "PASS",
    assetId: asset.id,
    titleId: asset.title_id,
    byteSize: sealed.byteSize,
    persisted: true,
    auditPreserved: true,
    fixtureKeyPreserved: true,
    runOwnedSourceRemoved: true,
    runOwnedSealedDestinationRemoved: true,
    databaseStateRestored: true,
  }));
} catch (error) {
  console.error("STORAGE_E2E_FAILED", redact(error instanceof Error ? error.message : String(error)));
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error("CLEANUP_FAILED", redact(cleanupError instanceof Error ? cleanupError.message : String(cleanupError)));
    process.exitCode = 2;
  }
  process.exitCode ||= 1;
} finally {
  await pool.end();
}
