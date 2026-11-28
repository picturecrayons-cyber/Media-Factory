import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function fixture() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create table public.bridge_titles (
      id text primary key,
      status text not null,
      master_key text,
      poster_key text
    );
    create table public.bridge_assets (
      id text primary key,
      title_id text not null,
      kind text not null,
      s3_key text not null,
      byte_size bigint
    );
    create table public.bridge_audit_logs (
      id serial primary key,
      actor_user_id text not null default 'tester',
      action text not null,
      entity_type text not null,
      entity_id text,
      metadata text not null default '{}'
    );
  `);
  await db.exec(readFileSync(new URL("../../../migrations/20261127023532_bridge_qc_match_sealed_asset_pointers.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../../../migrations/20261127023623_bridge_qc_install_verified_asset_trigger.sql", import.meta.url), "utf8"));
  return db;
}

test("QC rejects legacy exact-key rows even when byte_size is positive", async () => {
  const db = await fixture();
  try {
    await db.exec(`
      insert into public.bridge_titles values ('legacy-title','PREPARING','source/master.mov','source/poster.jpg');
      insert into public.bridge_assets values
        ('master','legacy-title','master','source/master.mov',4096),
        ('poster','legacy-title','poster','source/poster.jpg',1024);
    `);
    await assert.rejects(
      db.exec("update public.bridge_titles set status='QC_REVIEW' where id='legacy-title'"),
      /QC_BLOCKED_VERIFIED_ASSETS_REQUIRED/,
    );
    assert.equal((await db.query<{ status: string }>("select status from public.bridge_titles where id='legacy-title'")).rows[0].status, "PREPARING");
  } finally {
    await db.close();
  }
});

test("QC accepts sealed master and poster only with matching persisted verification evidence", async () => {
  const db = await fixture();
  try {
    await db.exec(`
      insert into public.bridge_titles values (
        'verified-title','PREPARING',
        'source/master.mov.verified/master-asset',
        'source/poster.jpg.verified/poster-asset'
      );
      insert into public.bridge_assets values
        ('master-asset','verified-title','master','source/master.mov.verified/master-asset',4096),
        ('poster-asset','verified-title','poster','source/poster.jpg.verified/poster-asset',1024);
      insert into public.bridge_audit_logs(action,entity_type,entity_id,metadata) values
        ('asset.upload_verified','bridge_asset','master-asset',
          '{"titleId":"verified-title","kind":"master","byteSize":4096,"checksum":"etag-master"}'),
        ('asset.upload_verified','bridge_asset','poster-asset',
          '{"titleId":"verified-title","kind":"poster","byteSize":1024,"checksum":"etag-poster"}');
    `);
    await db.exec("update public.bridge_titles set status='QC_REVIEW' where id='verified-title'");
    assert.equal((await db.query<{ status: string }>("select status from public.bridge_titles where id='verified-title'")).rows[0].status, "QC_REVIEW");
  } finally {
    await db.close();
  }
});

test("QC rejects mismatched size, missing checksum, or a non-sealed asset pointer", async () => {
  const db = await fixture();
  try {
    await db.exec(`
      insert into public.bridge_titles values (
        'bad-evidence','PREPARING',
        'source/master.mov.verified/master-asset',
        'source/poster.jpg.verified/poster-asset'
      );
      insert into public.bridge_assets values
        ('master-asset','bad-evidence','master','source/master.mov.verified/master-asset',4096),
        ('poster-asset','bad-evidence','poster','source/poster.jpg.verified/poster-asset',1024);
      insert into public.bridge_audit_logs(action,entity_type,entity_id,metadata) values
        ('asset.upload_verified','bridge_asset','master-asset',
          '{"titleId":"bad-evidence","kind":"master","byteSize":2048,"checksum":"etag-master"}'),
        ('asset.upload_verified','bridge_asset','poster-asset',
          '{"titleId":"bad-evidence","kind":"poster","byteSize":1024,"checksum":""}');
    `);
    await assert.rejects(
      db.exec("update public.bridge_titles set status='QC_REVIEW' where id='bad-evidence'"),
      /QC_BLOCKED_VERIFIED_ASSETS_REQUIRED/,
    );
  } finally {
    await db.close();
  }
});
