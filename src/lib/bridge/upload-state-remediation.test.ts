import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { ASSET_KINDS, type AssetKind } from "./types.ts";
import { persistVerifiedAsset } from "./asset-confirmation.ts";
import { validateOttIngestFile } from "./ott-ingest-spec.ts";

test("all 9 supported asset types are valid in OTT ingest specification", () => {
  const expectedKinds: AssetKind[] = [
    "master",
    "screener",
    "poster_vertical",
    "poster_horizontal",
    "thumbnail",
    "subtitle",
    "censor_certificate",
    "technical",
    "poster",
  ];

  for (const kind of expectedKinds) {
    assert.ok(ASSET_KINDS.includes(kind), `Expected ASSET_KINDS to include ${kind}`);
  }

  // Verify valid filenames for each asset type pass ingest validation
  const testFiles: Record<AssetKind, { filename: string; contentType: string }> = {
    master: { filename: "film_master.mp4", contentType: "video/mp4" },
    screener: { filename: "trailer.mp4", contentType: "video/mp4" },
    poster_vertical: { filename: "poster_v.jpg", contentType: "image/jpeg" },
    poster_horizontal: { filename: "poster_h.png", contentType: "image/png" },
    thumbnail: { filename: "thumb.webp", contentType: "image/webp" },
    subtitle: { filename: "subtitles.vtt", contentType: "text/vtt" },
    censor_certificate: { filename: "certificate.pdf", contentType: "application/pdf" },
    technical: { filename: "lut.cube", contentType: "text/plain" },
    poster: { filename: "artwork.jpeg", contentType: "image/jpeg" },
  };

  for (const [kind, file] of Object.entries(testFiles) as Array<[AssetKind, { filename: string; contentType: string }]>) {
    const res = validateOttIngestFile({ kind, filename: file.filename, contentType: file.contentType });
    assert.equal(res.ok, true, `Expected ${kind} with ${file.filename} to be valid: ${!res.ok ? res.message : ""}`);
  }
});

test("verified asset persistence atomically updates canonical Bridge records without a Loop queue", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`
      insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type, status)
      values ('title-verify-test', 'title-verify', 'Verify Test Title', 'owner-1', 'independent_creator', 'PREPARING');
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values ('asset-verify-1', 'title-verify-test', 'master', 'bridge/owner-1/title-verify-test/master/raw.mp4', 'video/mp4', 'owner-1');
    `);

    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: "asset-verify-1",
      actorUserId: "owner-1",
      internalActor: false,
      titleId: "title-verify-test",
      kind: "master",
      byteSize: 52428800,
      contentType: "video/mp4",
      checksum: "sealed-etag-abc",
      sourceKey: "bridge/owner-1/title-verify-test/master/raw.mp4",
      sealedKey: "bridge/owner-1/title-verify-test/master/raw.mp4.verified/asset-verify-1",
    });
    assert.equal(confirmed, true);

    const assetRows = (await db.query<{ byte_size: number; s3_key: string }>(
      "select byte_size, s3_key from bridge_assets where id = 'asset-verify-1'",
    )).rows;
    assert.equal(Number(assetRows[0]?.byte_size), 52428800);
    assert.equal(assetRows[0]?.s3_key, "bridge/owner-1/title-verify-test/master/raw.mp4.verified/asset-verify-1");

    const titleRows = (await db.query<{ master_key: string | null }>(
      "select master_key from bridge_titles where id = 'title-verify-test'",
    )).rows;
    assert.equal(titleRows[0]?.master_key, "bridge/owner-1/title-verify-test/master/raw.mp4.verified/asset-verify-1");

    const auditRows = (await db.query<{ action: string; entity_id: string }>(
      "select action, entity_id from bridge_audit_logs where entity_id = 'asset-verify-1'",
    )).rows;
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0]?.action, "asset.upload_verified");

    const secondAttempt = await persistVerifiedAsset(sql, {
      assetId: "asset-verify-1",
      actorUserId: "owner-1",
      internalActor: false,
      titleId: "title-verify-test",
      kind: "master",
      byteSize: 52428800,
      contentType: "video/mp4",
      checksum: "sealed-etag-abc",
      sourceKey: "bridge/owner-1/title-verify-test/master/raw.mp4",
      sealedKey: "bridge/owner-1/title-verify-test/master/raw.mp4.verified/asset-verify-1",
    });
    assert.equal(secondAttempt, false);
    assert.equal((await db.query("select id from bridge_audit_logs where entity_id = 'asset-verify-1'")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("duplicate upload confirmations derive the same sealed key from the asset row ID", () => {
  const assets = readFileSync(join(process.cwd(), "src/lib/bridge/assets.ts"), "utf8");
  assert.ok(assets.includes('const sealedKey = `${asset.s3_key}.verified/${asset.id}`;'));
  assert.doesNotMatch(assets, /randomUUID/);
});

test("verification timeout warns that server-side work may still complete and requires refresh before retry", () => {
  const route = readFileSync(join(process.cwd(), "src/routes/title.$id.tsx"), "utf8");
  assert.match(route, /Stored-object verification timed out/);
  assert.match(route, /The server may still be finishing verification/);
  assert.match(route, /Refresh the asset list and check its status before retrying/);
  assert.match(route, /125_000/);
  const oci = readFileSync(join(process.cwd(), "src/lib/bridge/oci-object-storage.server.ts"), "utf8");
  assert.match(oci, /deadlineMs \?\? 120_000/);
  assert.match(oci, /within 120 seconds/);
});
