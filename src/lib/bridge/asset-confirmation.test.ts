import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { persistVerifiedAsset } from "./asset-confirmation.ts";

test("only a verified upload sets the active artwork reference, once, with an audit event", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type)
      values ('title1234','title','Title','creator','independent_creator');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('asset1234','title1234','thumbnail','bridge/creator/title1234/thumbnail/art.jpg','image/jpeg','creator');`);
    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const args = {
      assetId: "asset1234",
      actorUserId: "creator",
      internalActor: false,
      titleId: "title1234",
      kind: "thumbnail",
      byteSize: 120,
      contentType: "image/jpeg",
      checksum: "etag-1",
      sourceKey: "bridge/creator/title1234/thumbnail/art.jpg",
      sealedKey: "bridge/creator/title1234/thumbnail/art.jpg.verified/uuid-1",
    };
    const state = async () => (await db.query<{ poster_key: string | null; master_key: string | null; byte_size: number | null }>(`
      select t.poster_key, t.master_key, a.byte_size from bridge_titles t join bridge_assets a on a.title_id=t.id
      where a.id='asset1234'`)).rows[0];
    assert.deepEqual(await state(), { poster_key: null, master_key: null, byte_size: null });
    assert.equal(await persistVerifiedAsset(sql, { ...args, actorUserId: "intruder" }), false);
    assert.deepEqual(await state(), { poster_key: null, master_key: null, byte_size: null });
    assert.equal(await persistVerifiedAsset(sql, args), true);
    assert.deepEqual(await state(), { poster_key: "bridge/creator/title1234/thumbnail/art.jpg.verified/uuid-1", master_key: null, byte_size: 120 });
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
