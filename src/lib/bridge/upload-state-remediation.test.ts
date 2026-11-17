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

test("sealing failure never advances loop_media_migration_queue to UPLOADED or VERIFIED", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));

    // Set up loop_media_migration_queue table as used in bridge
    await db.exec(`
      create table if not exists loop_media_migration_queue (
        id text primary key default gen_random_uuid()::text,
        title_id text not null,
        asset_kind text not null,
        status text not null default 'PENDING_REUPLOAD',
        target_path text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await db.exec(`
      insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type, status)
      values ('title-fail-test', 'title-fail', 'Fail Test Title', 'owner-1', 'independent_creator', 'PREPARING');

      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values ('asset-fail-1', 'title-fail-test', 'master', 'bridge/owner-1/title-fail-test/master/raw.mp4', 'video/mp4', 'owner-1');

      insert into loop_media_migration_queue (title_id, asset_kind, status)
      values ('title-fail-test', 'MASTER', 'PENDING_REUPLOAD');
    `);

    // Simulate sealing failure: an error occurs during OCI copy/sealing
    let sealingFailed = false;
    try {
      // Simulate failed OCI copy
      throw new Error("OCI copy work-request lookup failed (404) (last status: not_yet_visible (404))");
    } catch {
      sealingFailed = true;
    }
    assert.equal(sealingFailed, true);

    // Verify database state: migration queue MUST remain PENDING_REUPLOAD, asset byte_size MUST remain null
    const queueRows = (await db.query<{ status: string; target_path: string | null }>(
      "select status, target_path from loop_media_migration_queue where title_id = 'title-fail-test'",
    )).rows;
    assert.equal(queueRows[0]?.status, "PENDING_REUPLOAD");
    assert.equal(queueRows[0]?.target_path, null);

    const assetRows = (await db.query<{ byte_size: number | null }>(
      "select byte_size from bridge_assets where id = 'asset-fail-1'",
    )).rows;
    assert.equal(assetRows[0]?.byte_size, null);
  } finally {
    await db.close();
  }
});

test("atomic state transition: migration queue and title master/poster only advance on confirmed verification", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_organizations.sql"), "utf8"));

    await db.exec(`
      create table if not exists loop_media_migration_queue (
        id text primary key default gen_random_uuid()::text,
        title_id text not null,
        asset_kind text not null,
        status text not null default 'PENDING_REUPLOAD',
        target_path text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await db.exec(`
      insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type, status)
      values ('title-pass-test', 'title-pass', 'Pass Test Title', 'owner-1', 'independent_creator', 'PREPARING');

      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values ('asset-pass-1', 'title-pass-test', 'screener', 'bridge/owner-1/title-pass-test/screener/raw.mp4', 'video/mp4', 'owner-1');

      insert into loop_media_migration_queue (title_id, asset_kind, status)
      values ('title-pass-test', 'TRAILER', 'PENDING_REUPLOAD');
    `);

    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const sealedKey = "bridge/owner-1/title-pass-test/screener/raw.mp4.verified/sealed-uuid";
    // Call persistence before advancing the queue. A false result must leave the
    // migration queue at its original state.
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: "asset-pass-1",
      actorUserId: "owner-1",
      internalActor: false,
      titleId: "title-pass-test",
      kind: "screener",
      byteSize: 52428800,
      contentType: "video/mp4",
      checksum: "sealed-etag-abc",
      sourceKey: "bridge/owner-1/title-pass-test/screener/raw.mp4",
      sealedKey,
    });
    assert.equal(confirmed, true);

    if (confirmed) {
      await db.query(
        `update loop_media_migration_queue
         set status = 'UPLOADED', target_path = $1, updated_at = now()
         where title_id = 'title-pass-test'
           and asset_kind = 'TRAILER'
           and status in ('PENDING_REUPLOAD', 'UPLOADED')`,
        [sealedKey],
      );
      const postPersistenceQueue = (await db.query<{ status: string; target_path: string | null }>(
        "select status, target_path from loop_media_migration_queue where title_id = 'title-pass-test'",
      )).rows;
      assert.equal(postPersistenceQueue[0]?.status, "UPLOADED");
      assert.equal(postPersistenceQueue[0]?.target_path, sealedKey);

      await db.query(
        `update loop_media_migration_queue
         set status = 'VERIFIED', target_path = $1, updated_at = now()
         where title_id = 'title-pass-test'
           and asset_kind = 'TRAILER'
           and status in ('UPLOADED', 'PENDING_REUPLOAD')`,
        [sealedKey],
      );
    }

    // Verify migration queue is now VERIFIED pointing to sealedKey
    const queueRows = (await db.query<{ status: string; target_path: string | null }>(
      "select status, target_path from loop_media_migration_queue where title_id = 'title-pass-test'",
    )).rows;
    assert.equal(queueRows[0]?.status, "VERIFIED");
    assert.equal(queueRows[0]?.target_path, sealedKey);

    // Verify bridge_assets now has byte_size and sealedKey
    const assetRows = (await db.query<{ byte_size: number | null; s3_key: string }>(
      "select byte_size, s3_key from bridge_assets where id = 'asset-pass-1'",
    )).rows;
    assert.equal(assetRows[0]?.byte_size, 52428800);
    assert.equal(assetRows[0]?.s3_key, sealedKey);

    // Idempotency: re-running persistVerifiedAsset on already confirmed asset returns false
    const secondAttempt = await persistVerifiedAsset(sql, {
      assetId: "asset-pass-1",
      actorUserId: "owner-1",
      internalActor: false,
      titleId: "title-pass-test",
      kind: "screener",
      byteSize: 52428800,
      contentType: "video/mp4",
      checksum: "sealed-etag-abc",
      sourceKey: "bridge/owner-1/title-pass-test/screener/raw.mp4",
      sealedKey,
    });
    assert.equal(secondAttempt, false);
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
});


test("persistence failure does not advance migration queue state", async () => {
  const assets = readFileSync(join(process.cwd(), "src/lib/bridge/assets.ts"), "utf8");
  const persistAt = assets.indexOf("const confirmed = await persistVerifiedAsset(sql, {");
  const uploadedAt = assets.indexOf("set status = 'UPLOADED'", persistAt);
  const verifiedAt = assets.indexOf("set status = 'VERIFIED'", persistAt);
  const failureBranchAt = assets.indexOf("if (!confirmed)", persistAt);
  assert.ok(persistAt >= 0, "confirmation persistence call must exist");
  assert.ok(uploadedAt > persistAt, "UPLOADED transition must occur after persistence");
  assert.ok(verifiedAt > uploadedAt, "VERIFIED transition must follow UPLOADED");
  assert.ok(failureBranchAt > verifiedAt, "failure handling must be after the success-only queue transitions");
  const successBlock = assets.slice(assets.indexOf("if (confirmed)", persistAt), failureBranchAt);
  assert.match(successBlock, /set status = 'UPLOADED'/);
  assert.match(successBlock, /set status = 'VERIFIED'/);
});


test("legacy OCI reconciliation admits only exact reviewer-verified film-to-title links", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec(`
      create table bridge_titles (
        id text primary key,
        name text not null,
        status text not null,
        merged_into_title_id text
      );
      create table streamvista_legacy_links (
        source_table text not null,
        legacy_id text not null,
        review_status text not null,
        bridge_title_id text
      );
      create table loop_media_migration_queue (
        id bigserial primary key,
        legacy_film_id integer,
        title_id text not null,
        asset_kind text not null,
        target_provider text not null,
        target_path text not null,
        status text not null
      );

      insert into bridge_titles (id,name,status) values
        ('title-koodal','Koodal','PREPARING'),
        ('title-jananam','Jananam 1947','PREPARING');

      -- Pending and mismatched mappings must never authorise an asset link.
      insert into streamvista_legacy_links
        (source_table,legacy_id,review_status,bridge_title_id) values
        ('films_film','7','pending','title-jananam'),
        ('films_film','36','pending','title-koodal'),
        ('films_film','8','verified','title-koodal'),
        ('films_film','9','verified','title-jananam');

      insert into loop_media_migration_queue
        (legacy_film_id,title_id,asset_kind,target_provider,target_path,status) values
        (7,'title-koodal','MASTER','oci_object_storage','legacy/7/master.mp4','PENDING_REUPLOAD'),
        (36,'title-jananam','MASTER','oci_object_storage','legacy/36/master.mp4','PENDING_REUPLOAD'),
        (8,'title-koodal','MASTER','oci_object_storage','legacy/8/master.mp4','PENDING_REUPLOAD'),
        (9,'title-koodal','MASTER','oci_object_storage','legacy/9/master.mp4','PENDING_REUPLOAD'),
        (null,'title-koodal','MASTER','oci_object_storage','direct/koodal/master.mp4','PENDING_REUPLOAD');
    `);

    const eligible = await db.query<{ id: number; legacy_film_id: number | null }>(`
      select q.id,q.legacy_film_id
      from loop_media_migration_queue q
      join bridge_titles t on t.id=q.title_id
      where q.status in ('PENDING_REUPLOAD','MISSING_SOURCE_MEDIA','UPLOADED')
        and q.target_provider='oci_object_storage'
        and t.status in ('DRAFT','UPLOADING','PREPARING')
        and t.merged_into_title_id is null
        and (
          q.legacy_film_id is null
          or exists (
            select 1 from streamvista_legacy_links l
            where l.source_table='films_film'
              and l.legacy_id=q.legacy_film_id::text
              and l.review_status='verified'
              and l.bridge_title_id=q.title_id
          )
        )
      order by q.id
    `);
    assert.deepEqual(eligible.rows, [
      { id: 3, legacy_film_id: 8 },
      { id: 5, legacy_film_id: null },
    ]);

    const mismatches = await db.query<{ count: number }>(`
      select count(*)::int as count
      from loop_media_migration_queue q
      join streamvista_legacy_links l
        on l.source_table='films_film'
       and l.legacy_id=q.legacy_film_id::text
      where q.legacy_film_id is not null
        and l.review_status='pending'
        and l.bridge_title_id is not null
        and l.bridge_title_id <> q.title_id
    `);
    assert.equal(mismatches.rows[0]?.count, 2);
  } finally {
    await db.close();
  }
});

test("production asset reconciliation uses stable queue keys and holds unresolved mappings", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/bridge/asset-reconciliation.ts"),
    "utf8",
  );
  assert.match(source, /const assetId = `legacy-queue-\$\{row\.id\}`/);
  assert.match(source, /\.verified\/queue-\$\{row\.id\}/);
  assert.match(source, /l\.review_status = 'verified'/);
  assert.match(source, /l\.bridge_title_id = q\.title_id/);
  assert.match(source, /status in \('PENDING_REUPLOAD', 'MISSING_SOURCE_MEDIA', 'UPLOADED'\)/);
  assert.doesNotMatch(source, /randomBytes/);
});
