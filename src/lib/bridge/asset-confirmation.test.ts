import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { persistVerifiedAsset } from "./asset-confirmation.ts";

test("only a verified upload sets the master reference, once, with an audit event", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type)
      values ('title1234','title','Title','creator','independent_creator');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('asset1234','title1234','master','bridge/creator/title1234/master/video.mp4','video/mp4','creator');`);
    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const args = {
      assetId: "asset1234",
      actorUserId: "creator",
      internalActor: false,
      titleId: "title1234",
      kind: "master",
      byteSize: 120,
      contentType: "video/mp4",
      checksum: "etag-1",
      sourceKey: "bridge/creator/title1234/master/video.mp4",
      sealedKey: "bridge/creator/title1234/master/video.mp4.verified/uuid-1",
    };
    const state = async () => (await db.query<{ master_key: string | null; byte_size: number | null }>(`
      select t.master_key, a.byte_size from bridge_titles t join bridge_assets a on a.title_id=t.id
      where a.id='asset1234'`)).rows[0];
    assert.deepEqual(await state(), { master_key: null, byte_size: null });
    assert.equal(await persistVerifiedAsset(sql, { ...args, actorUserId: "intruder" }), false);
    assert.deepEqual(await state(), { master_key: null, byte_size: null });
    assert.equal(await persistVerifiedAsset(sql, args), true);
    assert.deepEqual(await state(), { master_key: "bridge/creator/title1234/master/video.mp4.verified/uuid-1", byte_size: 120 });
    assert.equal(await persistVerifiedAsset(sql, args), false);
    assert.equal(await persistVerifiedAsset(sql, { ...args, assetId: "asset1234", sourceKey: "wrong" }), false);
    const audit = await db.query<{ action: string; metadata: string }>(
      "select action, metadata from bridge_audit_logs where entity_id='asset1234'",
    );
    assert.equal(audit.rows[0]?.action, "asset.upload_verified");
    assert.equal(JSON.parse(audit.rows[0]?.metadata ?? "{}").checksum, "etag-1");
  } finally {
    await db.close();
  }
});

test("poster_vertical verification updates poster_key on the title and records audit log", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
      values ('title-poster-1','title-poster','Poster Title','creator','independent_creator','DRAFT');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('asset-poster-1','title-poster-1','poster_vertical','bridge/creator/title-poster-1/poster_vertical/art.jpg','image/jpeg','creator');`);
    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const args = {
      assetId: "asset-poster-1",
      actorUserId: "creator",
      internalActor: false,
      titleId: "title-poster-1",
      kind: "poster_vertical",
      byteSize: 2048,
      contentType: "image/jpeg",
      checksum: "etag-poster-1",
      sourceKey: "bridge/creator/title-poster-1/poster_vertical/art.jpg",
      sealedKey: "bridge/creator/title-poster-1/poster_vertical/art.jpg.verified/asset-poster-1",
    };

    const before = (await db.query<{ poster_key: string | null; byte_size: number | null }>(`
      select t.poster_key, a.byte_size from bridge_titles t join bridge_assets a on a.title_id=t.id
      where a.id='asset-poster-1'`)).rows[0];
    assert.deepEqual(before, { poster_key: null, byte_size: null });

    const confirmed = await persistVerifiedAsset(sql, args);
    assert.equal(confirmed, true);

    const after = (await db.query<{ poster_key: string | null; byte_size: number | null; s3_key: string }>(`
      select t.poster_key, a.byte_size, a.s3_key from bridge_titles t join bridge_assets a on a.title_id=t.id
      where a.id='asset-poster-1'`)).rows[0];
    assert.equal(after?.poster_key, "bridge/creator/title-poster-1/poster_vertical/art.jpg.verified/asset-poster-1");
    assert.equal(after?.byte_size, 2048);
    assert.equal(after?.s3_key, "bridge/creator/title-poster-1/poster_vertical/art.jpg.verified/asset-poster-1");

    const audit = await db.query<{ action: string; metadata: string }>(
      "select action, metadata from bridge_audit_logs where entity_id='asset-poster-1'",
    );
    assert.equal(audit.rows[0]?.action, "asset.upload_verified");
    const meta = JSON.parse(audit.rows[0]?.metadata ?? "{}");
    assert.equal(meta.kind, "poster_vertical");
    assert.equal(meta.byteSize, 2048);
  } finally {
    await db.close();
  }
});

test("database persistence rejects non-positive byte size and fails closed for closed title status", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
      values ('title-closed','title-closed','Closed Title','creator','independent_creator','DELIVERED');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('asset-closed','title-closed','poster_vertical','bridge/creator/closed.jpg','image/jpeg','creator');`);
    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const baseArgs = {
      assetId: "asset-closed",
      actorUserId: "creator",
      internalActor: false,
      titleId: "title-closed",
      kind: "poster_vertical",
      byteSize: 100,
      contentType: "image/jpeg",
      checksum: "etag-1",
      sourceKey: "bridge/creator/closed.jpg",
      sealedKey: "bridge/creator/closed.jpg.verified/asset-closed",
    };

    // Fails on non-positive byte size before hitting DB
    await assert.rejects(
      persistVerifiedAsset(sql, { ...baseArgs, byteSize: 0 }),
      /Uploaded object is empty/,
    );
    await assert.rejects(
      persistVerifiedAsset(sql, { ...baseArgs, byteSize: -5 }),
      /Uploaded object is empty/,
    );

    // Fails closed (returns false) because title is in 'DELIVERED' status (not DRAFT, UPLOADING, PREPARING)
    const confirmed = await persistVerifiedAsset(sql, baseArgs);
    assert.equal(confirmed, false);
  } finally {
    await db.close();
  }
});

