import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

test("server-authoritative upload migration adds provenance, immutable pointers and private manifests", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0023_bridge_server_authoritative_uploads.sql"), "utf8"));
    const cols = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='bridge_assets'
      and column_name in ('storage_provider','storage_bucket','storage_namespace','storage_region',
        'storage_endpoint','checksum_sha256','source_object_key','verified_object_key',
        'object_version_id','object_generation','storage_verified_at')
      order by column_name
    `);
    assert.equal(cols.rows.length, 11);
    await db.exec(`
      insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type)
      values ('title-test','title-test','Synthetic','owner','independent_creator');
      insert into bridge_assets (id,title_id,kind,s3_key,source_object_key,created_by)
      values ('asset-test','title-test','master','source/key','source/key','owner');
      insert into bridge_private.upload_sessions
        (id,asset_id,actor_user_id,provider,bucket,region,endpoint,source_object_key,
         provider_upload_id,part_base_url,expected_size,part_size,idempotency_key,expires_at)
      values ('session-test','asset-test','owner','oci','test-bucket','ap-mumbai-1',
        'https://objectstorage.ap-mumbai-1.oraclecloud.com','source/key','upload-test',
        'https://objectstorage.ap-mumbai-1.oraclecloud.com/p/test/n/test/b/test/u/source/key/id/upload-test/',
        11000000,10485760,'idem-test',now()+interval '1 hour');
      insert into bridge_private.upload_parts (session_id,part_number,byte_start,byte_end,etag)
      values ('session-test',1,0,10485760,'etag-1'),('session-test',2,10485760,11000000,'etag-2');
    `);
    const manifest = await db.query<{ n: number }>(
      "select count(*)::int as n from bridge_private.upload_parts where session_id='session-test'",
    );
    assert.equal(manifest.rows[0]?.n, 2);
    const rls = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      select relrowsecurity,relforcerowsecurity from pg_class where oid='bridge_private.upload_sessions'::regclass
    `);
    assert.equal(rls.rows[0]?.relrowsecurity, true);
    assert.equal(rls.rows[0]?.relforcerowsecurity, true);
    await db.exec(`
      update bridge_assets set verified_object_key='sealed/key', storage_verified_at=now(),
        checksum_sha256='a'.repeat(64), storage_provider='oci', storage_bucket='test-bucket',
        storage_namespace='test-ns', storage_region='ap-mumbai-1',
        storage_endpoint='https://objectstorage.ap-mumbai-1.oraclecloud.com'
      where id='asset-test'
    `);
    await assert.rejects(db.exec(`
      update bridge_assets set verified_object_key='sealed/other' where id='asset-test'
    `), /immutable/i);
  } finally {
    await db.close();
  }
});
