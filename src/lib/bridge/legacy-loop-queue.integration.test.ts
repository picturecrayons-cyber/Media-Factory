import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { persistVerifiedAsset } from "./asset-confirmation.ts";
import { markLegacyLoopQueueUploaded, markLegacyLoopQueueVerified } from "./legacy-loop-queue.ts";

test("Bridge asset verification persists successfully when the optional legacy Loop queue is absent", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`
      insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type, status)
      values ('synthetic-title-queue-absent', 'synthetic-queue-absent', 'Synthetic queue-absent', 'synthetic-owner', 'independent_creator', 'PREPARING');
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values ('synthetic-asset-queue-absent', 'synthetic-title-queue-absent', 'poster_vertical', 'synthetic/source.jpg', 'image/jpeg', 'synthetic-owner');
    `);

    const presence = await db.query<{ present: boolean }>(
      "select to_regclass('public.loop_media_migration_queue') is not null as present",
    );
    assert.equal(presence.rows[0]?.present, false);

    const sealedKey = "synthetic/source.jpg.verified/synthetic-asset-queue-absent";
    await markLegacyLoopQueueUploaded(presence.rows[0]!.present, async () => {
      await db.query("update loop_media_migration_queue set status = 'UPLOADED'");
    });

    const sql = {
      query: async <T>(query: string, params: unknown[]) =>
        (await db.query<T>(query, params)).rows,
    };
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: "synthetic-asset-queue-absent",
      actorUserId: "synthetic-owner",
      internalActor: false,
      titleId: "synthetic-title-queue-absent",
      kind: "poster_vertical",
      byteSize: 2048,
      contentType: "image/jpeg",
      checksum: "synthetic-etag",
      sourceKey: "synthetic/source.jpg",
      sealedKey,
    });
    assert.equal(confirmed, true);

    await markLegacyLoopQueueVerified(presence.rows[0]!.present, confirmed, async () => {
      await db.query("update loop_media_migration_queue set status = 'VERIFIED'");
    });

    const asset = await db.query<{ byte_size: number; s3_key: string }>(
      "select byte_size, s3_key from bridge_assets where id = 'synthetic-asset-queue-absent'",
    );
    assert.equal(Number(asset.rows[0]?.byte_size), 2048);
    assert.equal(asset.rows[0]?.s3_key, sealedKey);

    const audit = await db.query<{ action: string }>(
      "select action from bridge_audit_logs where entity_id = 'synthetic-asset-queue-absent'",
    );
    assert.equal(audit.rows[0]?.action, "asset.upload_verified");

    const stillAbsent = await db.query<{ present: boolean }>(
      "select to_regclass('public.loop_media_migration_queue') is not null as present",
    );
    assert.equal(stillAbsent.rows[0]?.present, false);
  } finally {
    await db.close();
  }
});

test("legacy queue VERIFIED callback is skipped when persistence did not confirm the asset", async () => {
  let called = false;
  await markLegacyLoopQueueVerified(true, false, async () => {
    called = true;
  });
  assert.equal(called, false);
});
