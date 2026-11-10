import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Production Vault migration creates server-only relational workflow tables", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table bridge_titles (id text primary key);
      create table bridge_profiles (user_id text primary key);
    `);
    const migration = await readFile(
      new URL("../../../migrations/20261110121500_bridge_production_vault.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname like 'bridge_production%'
        and c.relkind = 'r'
      order by c.relname
    `);
    assert.equal(tables.rows.length, 9);
    assert.ok(tables.rows.every((table) => table.relrowsecurity), "every vault table must enable RLS");
    const browserPrivileges = await db.query<{ table_name: string; grantee: string }>(`
      select table_name, grantee
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name like 'bridge_production%'
        and grantee in ('anon', 'authenticated', 'PUBLIC')
    `);
    assert.equal(browserPrivileges.rows.length, 0, "browser roles must have no vault table grants");
    const copyConstraints = await db.query<{ constraint_name: string }>(`
      select constraint_name from information_schema.table_constraints
      where table_schema = 'public' and table_name = 'bridge_production_copy_verifications'
    `);
    assert.ok(copyConstraints.rows.some((row) => row.constraint_name === "bridge_production_copy_pass_requires_exact_independent_readback"));
    const copyIndexes = await db.query<{ indexdef: string }>(`
      select indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'bridge_production_copy_verifications'
    `);
    assert.ok(copyIndexes.rows.some((row) =>
      /unique.*clip_id.*media_kind.*failure_domain_id/i.test(row.indexdef),
    ), "each asset must use a distinct storage failure domain for each replica");
  } finally {
    await db.close();
  }
});

test("DIT copy evidence rejects duplicate failure domains and unverified PASS claims", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table bridge_titles (id text primary key);
      create table bridge_profiles (user_id text primary key);
      insert into bridge_titles values ('title-1');
      insert into bridge_profiles values ('creator-1');
    `);
    const migration = await readFile(
      new URL("../../../migrations/20261110121500_bridge_production_vault.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(`
      insert into bridge_productions (id, title_id, production_name, production_no, created_by)
      values ('00000000-0000-0000-0000-000000000001', 'title-1', 'Test Production', 'P-1', 'creator-1');
      insert into bridge_production_shooting_days (id, production_id, day_number, shooting_date)
      values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 1, '2026-11-10');
      insert into bridge_production_camera_cards (id, shooting_day_id, camera_id, card_no)
      values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'A', 'CARD-1');
      insert into bridge_production_ingest_manifests
        (id, production_id, shooting_day_id, camera_card_id, expected_clip_count, created_by)
      values ('manifest-1', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 1, 'creator-1');
      insert into bridge_production_clips
        (id, manifest_id, clip_number, original_filename, original_relative_path, byte_size,
         checksum_sha256, has_video, has_audio, duration_ms)
      values ('00000000-0000-0000-0000-000000000004', 'manifest-1', '001', 'clip.mov',
        'A/CARD-1/clip.mov', 100, repeat('a', 64), true, true, 1000);
      insert into bridge_production_copy_verifications
        (id, clip_id, media_kind, storage_tier, object_key, expected_byte_size, expected_sha256,
         observed_byte_size, observed_sha256, independently_verified, verified_at,
         storage_location_id, failure_domain_id, verification_result)
      values ('copy-master', '00000000-0000-0000-0000-000000000004', 'RAW', 'MASTER',
        'master/clip.mov', 100, repeat('a', 64), 100, repeat('a', 64), true, now(),
        'loc-master', 'failure-domain-a', 'PASS');
    `);
    await assert.rejects(
      db.exec(`
        insert into bridge_production_copy_verifications
          (id, clip_id, media_kind, storage_tier, object_key, expected_byte_size, expected_sha256,
           observed_byte_size, observed_sha256, independently_verified, verified_at,
           storage_location_id, failure_domain_id, verification_result)
        values ('copy-backup1', '00000000-0000-0000-0000-000000000004', 'RAW', 'BACKUP_1',
          'backup1/clip.mov', 100, repeat('a', 64), 100, repeat('a', 64), true, now(),
          'loc-backup1', 'failure-domain-a', 'PASS');
      `),
      /unique|duplicate/i,
    );
    await assert.rejects(
      db.exec(`
        insert into bridge_production_copy_verifications
          (id, clip_id, media_kind, storage_tier, object_key, expected_byte_size, expected_sha256,
           observed_byte_size, observed_sha256, independently_verified, verified_at,
           storage_location_id, failure_domain_id, verification_result)
        values ('copy-bad-hash', '00000000-0000-0000-0000-000000000004', 'AUDIO', 'MASTER',
          'master/audio.wav', 100, repeat('a', 64), 100, repeat('b', 64), true, now(),
          'loc-audio', 'failure-domain-b', 'PASS');
      `),
      /check constraint/i,
    );
  } finally {
    await db.close();
  }
});
