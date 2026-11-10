import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { persistVerifiedAsset } from "./asset-confirmation.ts";
 
function createTestSql(db: PGlite) {
  return {
    query: async <T>(query: string, params: unknown[] = []) =>
      (await db.query<T>(query, params)).rows,
    transaction: async <T>(
      callback: (tx: {
        query: <R>(query: string, params?: unknown[]) => Promise<R[]>;
      }) => Promise<T>,
    ) =>
      db.transaction(async (tx) =>
        callback({
          query: async <R>(query: string, params: unknown[] = []) =>
            (await tx.query<R>(query, params)).rows,
        }),
      ),
  };
}


test("only a verified upload sets the master reference, once, with an audit event", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`
      create table if not exists bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table if not exists bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table if not exists bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table if not exists bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table if not exists bridge_asset_versions (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        asset_group text not null,
        asset_type text not null,
        version integer not null,
        language text,
        reference_asset_id uuid,
        s3_key text not null,
        checksum_sha256 text,
        byte_size bigint,
        processing_state text not null,
        created_by text not null
      );
    `);
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_organizations.sql"), "utf8"));
    await db.exec(`
      create table if not exists bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table if not exists bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table if not exists bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table if not exists bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table if not exists bridge_asset_versions (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        asset_group text not null,
        asset_type text not null,
        version integer not null,
        language text,
        reference_asset_id uuid,
        s3_key text not null,
        checksum_sha256 text,
        byte_size bigint,
        processing_state text not null,
        created_by text not null
      );
    `);
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type)
      values ('title1234','title','Title','creator','independent_creator');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('asset1234','title1234','master','bridge/creator/title1234/master/video.mp4','video/mp4','creator');`);
    const sql = createTestSql(db);
    const args = {
      assetId: "asset1234",
      actorUserId: "creator",
      internalActor: false,
      superAdminActor: false,
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
    const versions = await db.query<{ asset_type: string; version: number; checksum_sha256: string }>(
      "select asset_type, version, checksum_sha256 from bridge_asset_versions where title_id='title1234'",
    );
    assert.deepEqual(versions.rows, [{ asset_type: "MASTER", version: 1, checksum_sha256: "etag-1" }]);
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

    // The persistence boundary must reject owner-level replacement even if a
    // caller bypasses the server-function Super Admin guard.
    await db.exec(`
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('owner-replacement','title1234','master','replacement/master','video/mp4','creator');
    `);
    assert.equal(await persistVerifiedAsset(sql, {
      ...args,
      assetId: "owner-replacement",
      sourceKey: "replacement/master",
      sealedKey: "replacement/master.verified/owner-replacement",
    }), false);
    const denied = await db.query<{ byte_size: number | null }>(
      "select byte_size from bridge_assets where id='owner-replacement'",
    );
    assert.equal(denied.rows[0]?.byte_size, null);

    // Concurrent Super Admin confirmations for one title must allocate
    // distinct sequential versions under the per-title transaction lock.
    await db.exec(`
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values
        ('parallel-one','title1234','master','parallel/one','video/mp4','super-admin'),
        ('parallel-two','title1234','master','parallel/two','video/mp4','super-admin');
    `);
    const parallelArgs = (assetId: string, sourceKey: string) => ({
      ...args,
      assetId,
      actorUserId: "super-admin",
      internalActor: true,
      superAdminActor: true,
      sourceKey,
      sealedKey: `${sourceKey}.verified/${assetId}`,
    });
    const parallelResults = await Promise.all([
      persistVerifiedAsset(sql, parallelArgs("parallel-one", "parallel/one")),
      persistVerifiedAsset(sql, parallelArgs("parallel-two", "parallel/two")),
    ]);
    assert.deepEqual(parallelResults, [true, true]);
    const allocated = await db.query<{ version: number }>(
      "select version from bridge_asset_versions where title_id='title1234' and asset_type='MASTER' order by version",
    );
    assert.deepEqual(allocated.rows.map((row) => row.version), [1, 2, 3]);
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
    await db.exec(`
      create table if not exists bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table if not exists bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table if not exists bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table if not exists bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table if not exists bridge_asset_versions (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        asset_group text not null,
        asset_type text not null,
        version integer not null,
        language text,
        reference_asset_id uuid,
        s3_key text not null,
        checksum_sha256 text,
        byte_size bigint,
        processing_state text not null,
        created_by text not null
      );
    `);
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_organizations.sql"), "utf8"));
    await db.exec(`
      create table if not exists bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table if not exists bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table if not exists bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table if not exists bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table if not exists bridge_asset_versions (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        asset_group text not null,
        asset_type text not null,
        version integer not null,
        language text,
        reference_asset_id uuid,
        s3_key text not null,
        checksum_sha256 text,
        byte_size bigint,
        processing_state text not null,
        created_by text not null
      );
    `);
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
    const sql = createTestSql(db);
    const common = {
      internalActor: false,
      superAdminActor: false,
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

test("title owner can confirm an upload when organization tables are absent", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`
      create table if not exists bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table if not exists bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table if not exists bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table if not exists bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table if not exists bridge_asset_versions (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        asset_group text not null,
        asset_type text not null,
        version integer not null,
        language text,
        reference_asset_id uuid,
        s3_key text not null,
        checksum_sha256 text,
        byte_size bigint,
        processing_state text not null,
        created_by text not null
      );
    `);
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
      values ('title1234','title','Title','creator','independent_creator','PREPARING');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('asset1234','title1234','screener','bridge/creator/title1234/screener/video.mp4','video/mp4','creator');`);
    const sql = createTestSql(db);
    assert.equal(await persistVerifiedAsset(sql, {
      assetId: "asset1234",
      actorUserId: "creator",
      internalActor: false,
      superAdminActor: false,
      titleId: "title1234",
      kind: "screener",
      byteSize: 170,
      contentType: "video/mp4",
      checksum: "etag-no-org",
      sourceKey: "bridge/creator/title1234/screener/video.mp4",
      sealedKey: "bridge/creator/title1234/screener/video.mp4.verified/asset1234",
    }), true);
    const row = (await db.query<{ byte_size: number | null }>(
      "select byte_size from bridge_assets where id='asset1234'",
    )).rows[0];
    assert.equal(row?.byte_size, 170);
  } finally {
    await db.close();
  }
});


test("Super Admin can replace a verified asset through RIGHTS_REVIEW before first delivery or publish", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`
      create table if not exists bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table if not exists bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table if not exists bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table if not exists bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table if not exists bridge_asset_versions (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        asset_group text not null,
        asset_type text not null,
        version integer not null,
        language text,
        reference_asset_id uuid,
        s3_key text not null,
        checksum_sha256 text,
        byte_size bigint,
        processing_state text not null,
        created_by text not null
      );
    `);
    await db.exec(`
      insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status,master_key)
      values ('replace-title','replace-title','Replace Title','owner','independent_creator','RIGHTS_REVIEW','old/master.verified/old');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,byte_size,created_by)
      values
        ('old-master','replace-title','master','old/master.verified/old','video/mp4',100,'owner'),
        ('new-master','replace-title','master','new/master','video/mp4',null,'super-admin');
      insert into bridge_qc_cases (title_id,status,reviewed_by,reviewed_at)
      values ('replace-title','PASSED','qc-user',now());
      insert into bridge_legal_cases (title_id,status,reviewed_by,reviewed_at)
      values ('replace-title','APPROVED','legal-user',now());
      insert into bridge_title_gate_certifications
        (title_id,ott_preparation_status,packaging_status,curation_status,delivery_status,updated_at)
      values ('replace-title','READY','COMPLETE','APPROVED','READY',now());
      insert into bridge_destination_packages (title_id,readiness_state,authorized_by,authorized_at)
      values ('replace-title','AUTHORIZED','admin-user',now());
    `);
    const sql = createTestSql(db);
    const result = await persistVerifiedAsset(sql, {
      assetId: "new-master",
      actorUserId: "super-admin",
      internalActor: true,
      superAdminActor: true,
      titleId: "replace-title",
      kind: "master",
      byteSize: 200,
      contentType: "video/mp4",
      checksum: "new-etag",
      sourceKey: "new/master",
      sealedKey: "new/master.verified/new-master",
    });
    assert.equal(result, true);
    const state = await db.query<{ master_key: string; old_size: number; new_size: number }>(`
      select t.master_key, old.byte_size as old_size, fresh.byte_size as new_size
      from bridge_titles t
      join bridge_assets old on old.id='old-master'
      join bridge_assets fresh on fresh.id='new-master'
      where t.id='replace-title'
    `);
    assert.deepEqual(state.rows[0], {
      master_key: "new/master.verified/new-master",
      old_size: 100,
      new_size: 200,
    });
    const gates = await db.query<{ status: string }>("select status from bridge_qc_cases where title_id='replace-title'");
    const legal = await db.query<{ status: string }>("select status from bridge_legal_cases where title_id='replace-title'");
    const packageState = await db.query<{ readiness_state: string; authorized_at: string | null }>("select readiness_state, authorized_at from bridge_destination_packages where title_id='replace-title'");
    const gateState = await db.query<{ ott_preparation_status: string; packaging_status: string; curation_status: string; delivery_status: string }>("select ott_preparation_status, packaging_status, curation_status, delivery_status from bridge_title_gate_certifications where title_id='replace-title'");
    assert.equal(gates.rows[0]?.status, "ACTION_REQUIRED");
    assert.equal(legal.rows[0]?.status, "ACTION_REQUIRED");
    assert.equal(packageState.rows[0]?.readiness_state, "HOLD");
    assert.equal(packageState.rows[0]?.authorized_at, null);
    assert.deepEqual(gateState.rows[0], {
      ott_preparation_status: "HOLD",
      packaging_status: "HOLD",
      curation_status: "HOLD",
      delivery_status: "HOLD",
    });
  } finally {
    await db.close();
  }
});

test("first LOOP publication permanently locks Super Admin replacement", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`
      create table if not exists bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table if not exists bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table if not exists bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table if not exists bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table if not exists bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table if not exists bridge_asset_versions (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        asset_group text not null,
        asset_type text not null,
        version integer not null,
        language text,
        reference_asset_id uuid,
        s3_key text not null,
        checksum_sha256 text,
        byte_size bigint,
        processing_state text not null,
        created_by text not null
      );
    `);
    await db.exec(`
      insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
      values ('locked-title','locked-title','Locked Title','owner','independent_creator','RIGHTS_REVIEW');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('locked-asset','locked-title','master','locked/master','video/mp4','super-admin');
      insert into bridge_loop_publications (bridge_title_id,approved_at)
      values ('locked-title',now());
    `);
    const sql = createTestSql(db);
    const result = await persistVerifiedAsset(sql, {
      assetId: "locked-asset",
      actorUserId: "super-admin",
      internalActor: true,
      superAdminActor: true,
      titleId: "locked-title",
      kind: "master",
      byteSize: 200,
      contentType: "video/mp4",
      checksum: "blocked-etag",
      sourceKey: "locked/master",
      sealedKey: "locked/master.verified/locked-asset",
    });
    assert.equal(result, false);
    const row = await db.query<{ byte_size: number | null }>("select byte_size from bridge_assets where id='locked-asset'");
    assert.equal(row.rows[0]?.byte_size, null);
  } finally {
    await db.close();
  }
});


test("signed delivery receipt permanently locks Super Admin replacement", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`
      create table bridge_loop_publications (bridge_title_id text, approved_at timestamptz);
      create table bridge_destination_packages (title_id text, readiness_state text, authorized_by text, authorized_at timestamptz);
      create table bridge_delivery_jobs (title_id text, admin_sign_off boolean, delivery_receipt_url text);
      create table bridge_qc_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table bridge_legal_cases (title_id text, status text, reviewed_by text, reviewed_at timestamptz);
      create table bridge_title_gate_certifications (
        title_id text, ott_preparation_status text, packaging_status text,
        curation_status text, delivery_status text, updated_at timestamptz
      );
      create table bridge_asset_versions (
        id uuid primary key default gen_random_uuid(), title_id text not null,
        asset_group text not null, asset_type text not null, version integer not null,
        language text, reference_asset_id uuid, s3_key text not null,
        checksum_sha256 text, byte_size bigint, processing_state text not null, created_by text not null
      );
      insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
      values ('delivered-title','delivered-title','Delivered Title','owner','independent_creator','RIGHTS_REVIEW');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('delivered-asset','delivered-title','master','delivered/master','video/mp4','super-admin');
      insert into bridge_delivery_jobs (title_id,admin_sign_off,delivery_receipt_url)
      values ('delivered-title',true,'https://receipt.example.test/delivery/1');
    `);
    const sql = createTestSql(db);
    const result = await persistVerifiedAsset(sql, {
      assetId: "delivered-asset",
      actorUserId: "super-admin",
      internalActor: true,
      superAdminActor: true,
      titleId: "delivered-title",
      kind: "master",
      byteSize: 200,
      contentType: "video/mp4",
      checksum: "blocked-delivery-etag",
      sourceKey: "delivered/master",
      sealedKey: "delivered/master.verified/delivered-asset",
    });
    assert.equal(result, false);
    const row = await db.query<{ byte_size: number | null }>("select byte_size from bridge_assets where id='delivered-asset'");
    assert.equal(row.rows[0]?.byte_size, null);

    await db.exec(`
      insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
      values ('package-delivered-title','package-delivered-title','Package Delivered','owner','independent_creator','RIGHTS_REVIEW');
      insert into bridge_assets (id,title_id,kind,s3_key,content_type,created_by)
      values ('package-delivered-asset','package-delivered-title','master','package/master','video/mp4','super-admin');
      insert into bridge_destination_packages (title_id,readiness_state)
      values ('package-delivered-title','DELIVERED');
    `);
    const packageLocked = await persistVerifiedAsset(sql, {
      assetId: "package-delivered-asset",
      actorUserId: "super-admin",
      internalActor: true,
      superAdminActor: true,
      titleId: "package-delivered-title",
      kind: "master",
      byteSize: 200,
      contentType: "video/mp4",
      checksum: "blocked-package-etag",
      sourceKey: "package/master",
      sealedKey: "package/master.verified/package-delivered-asset",
    });
    assert.equal(packageLocked, false);
    const packageAsset = await db.query<{ byte_size: number | null }>(
      "select byte_size from bridge_assets where id='package-delivered-asset'",
    );
    assert.equal(packageAsset.rows[0]?.byte_size, null);
  } finally {
    await db.close();
  }
});
