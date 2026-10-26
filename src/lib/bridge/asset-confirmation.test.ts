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
    await db.exec(readFileSync(join(process.cwd(), "migrations/0014_bridge_asset_storage_state.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_organizations.sql"), "utf8"));
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
    // A caller cannot verify an asset while supplying a different title ID.
    assert.equal(await persistVerifiedAsset(sql, { ...args, titleId: "different-title" }), false);
    const audit = await db.query<{ action: string; metadata: string }>(
      "select action, metadata from bridge_audit_logs where entity_id='asset1234'",
    );
    assert.equal(audit.rows[0]?.action, "asset.upload_verified");
    const metadata = JSON.parse(audit.rows[0]?.metadata ?? "{}");
    assert.equal(metadata.checksum, "etag-1");
    assert.equal(metadata.titleId, "title1234");
    assert.equal(metadata.kind, "master");
  } finally {
    await db.close();
  }
});


test("same-organization verified Studio member can confirm upload, other organization is denied", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0014_bridge_asset_storage_state.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_organizations.sql"), "utf8"));
    await db.exec(`
      insert into bridge_profiles (user_id,email,display_name,account_type,email_verified)
      values
        ('studio-owner','owner@example.test','Owner','studio',true),
        ('studio-member','member@example.test','Member','studio',true),
        ('studio-other','other@example.test','Other','studio',true);
      insert into bridge_organizations (id,legal_name,normalized_name,status)
      values
        ('11111111-1111-4111-8111-111111111111','Studio A','studio a','active'),
        ('22222222-2222-4222-8222-222222222222','Studio B','studio b','active');
      update bridge_profiles set organization_id='11111111-1111-4111-8111-111111111111'
        where user_id in ('studio-owner','studio-member');
      update bridge_profiles set organization_id='22222222-2222-4222-8222-222222222222'
        where user_id='studio-other';
      insert into bridge_organization_memberships (organization_id,user_id,membership_role,status)
      values
        ('11111111-1111-4111-8111-111111111111','studio-owner','owner','active'),
        ('11111111-1111-4111-8111-111111111111','studio-member','member','active'),
        ('22222222-2222-4222-8222-222222222222','studio-other','member','active');
      insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,owner_organization_id)
      values
        ('title-same-org','same-org','Same org','studio-owner','studio','11111111-1111-4111-8111-111111111111'),
        ('title-other-org','other-org','Other org','studio-owner','studio','11111111-1111-4111-8111-111111111111');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values
        ('asset-same-org','title-same-org','master','source/same.mp4','video/mp4','studio-member'),
        ('asset-other-org','title-other-org','master','source/other.mp4','video/mp4','studio-other');
    `);
    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const common = {
      internalActor: false,
      kind: "master",
      byteSize: 120,
      contentType: "video/mp4",
      checksum: "etag-staging-test",
    };
    assert.equal(await persistVerifiedAsset(sql, {
      ...common,
      assetId: "asset-same-org",
      actorUserId: "studio-member",
      titleId: "title-same-org",
      sourceKey: "source/same.mp4",
      sealedKey: "sealed/same.mp4",
    }), true);
    assert.equal(await persistVerifiedAsset(sql, {
      ...common,
      assetId: "asset-other-org",
      actorUserId: "studio-other",
      titleId: "title-other-org",
      sourceKey: "source/other.mp4",
      sealedKey: "sealed/other.mp4",
    }), false);
    const states = await db.query<{ id: string; byte_size: number | null }>(
      "select id, byte_size from bridge_assets where id in ('asset-same-org','asset-other-org') order by id",
    );
    assert.deepEqual(states.rows, [
      { id: "asset-other-org", byte_size: null },
      { id: "asset-same-org", byte_size: 120 },
    ]);
  } finally {
    await db.close();
  }
});
