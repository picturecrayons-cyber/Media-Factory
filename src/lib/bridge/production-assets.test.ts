import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { syncVerifiedProductionAsset } from "./production-assets.ts";

const migrationPath = join(
  process.cwd(),
  "migrations/20261121190000_bridge_production_asset_source_sync.sql",
);

test("backfill and runtime sync create one metadata link per verified source and preserve legacy pointers", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec(`
      create table bridge_assets (
        id text primary key,
        title_id text not null,
        kind text not null,
        s3_key text not null,
        content_type text,
        byte_size bigint,
        storage_business_state text,
        restore_state text,
        storage_tier text
      );
      create table bridge_production_assets (
        id uuid primary key default gen_random_uuid(),
        title_id text not null,
        category text not null,
        file_name text not null,
        file_path text not null,
        file_size bigint not null,
        content_type text,
        tags jsonb default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      insert into bridge_assets
        (id,title_id,kind,s3_key,content_type,byte_size,storage_business_state,restore_state,storage_tier)
      values
        ('master-1','title-1','master','bridge/owner/title-1/master/film.mp4.verified/master-1','video/mp4',1200,'ACTIVE','READY','STANDARD'),
        ('poster-1','title-1','poster_vertical','bridge/owner/title-1/poster_vertical/poster.jpg.verified/poster-1','image/jpeg',400,'ACTIVE','READY','STANDARD'),
        ('unverified-1','title-1','subtitle','bridge/owner/title-1/subtitle/captions.srt','text/plain',null,'ACTIVE','READY','STANDARD'),
        ('inactive-1','title-1','screener','bridge/owner/title-1/screener/trailer.mp4.verified/inactive-1','video/mp4',500,'ARCHIVED','READY','STANDARD');
      insert into bridge_production_assets
        (title_id,category,file_name,file_path,file_size,tags)
      values (
        'title-1','stills','legacy-poster.jpg','legacy/title/poster.jpg',0,
        jsonb_build_object(
          'link_type','legacy_title_pointer',
          'source_table','bridge_assets',
          'source_asset_id','poster-1',
          'verified_source',false,
          'verification_state','UNVERIFIED_POINTER'
        )
      );
    `);

    const sql = {
      query: async <T>(query: string, params: unknown[] = []) =>
        (await db.query<T>(query, params)).rows,
    };

    // Run the same idempotent SQL migration used by the deployment applier.
    await db.exec(readFileSync(migrationPath, "utf8"));
    await db.exec(readFileSync(migrationPath, "utf8"));

    const afterBackfill = await db.query<{
      id: string;
      category: string;
      file_name: string;
      file_size: number;
      source_asset_id: string;
    }>(`
      select id, category, file_name, file_size,
        tags->>'source_asset_id' as source_asset_id
      from bridge_production_assets
      where tags->>'link_type'='metadata_reference'
      order by source_asset_id
    `);
    assert.equal(afterBackfill.rows.length, 2);
    assert.deepEqual(
      afterBackfill.rows.map((row) => [row.source_asset_id,row.category,row.file_name]),
      [
        ["master-1","raw_video","film.mp4"],
        ["poster-1","stills","poster.jpg"],
      ],
    );

    // A repeated confirmation updates the same metadata row, not a duplicate.
    await db.exec("update bridge_assets set byte_size=1300 where id='master-1'");
    assert.equal(
      await syncVerifiedProductionAsset(sql, { assetId:"master-1", titleId:"title-1" }),
      true,
    );
    assert.equal(
      await syncVerifiedProductionAsset(sql, { assetId:"master-1", titleId:"title-1" }),
      true,
    );
    const count = await db.query<{ n: number }>(`
      select count(*)::int as n from bridge_production_assets
      where tags->>'source_asset_id'='master-1'
        and tags->>'link_type'='metadata_reference'
    `);
    assert.equal(count.rows[0]?.n, 1);

    // Legacy pointers remain unverified and are not overwritten by the backfill.
    const legacy = await db.query<{ file_size: number; link_type: string; verified_source: boolean }>(`
      select file_size, tags->>'link_type' as link_type,
        coalesce((tags->>'verified_source')::boolean,false) as verified_source
      from bridge_production_assets
      where tags->>'link_type'='legacy_title_pointer'
    `);
    assert.deepEqual(legacy.rows[0], {
      file_size: 0,
      link_type: "legacy_title_pointer",
      verified_source: false,
    });

    // Unverified or non-active sources are never inserted.
    assert.equal(
      await syncVerifiedProductionAsset(sql, { assetId:"unverified-1", titleId:"title-1" }),
      false,
    );
    assert.equal(
      await syncVerifiedProductionAsset(sql, { assetId:"inactive-1", titleId:"title-1" }),
      false,
    );
  } finally {
    await db.close();
  }
});
