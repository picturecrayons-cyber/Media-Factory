import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { persistVerifiedAsset } from "./asset-confirmation.ts";
import { ASSET_KINDS } from "./types.ts";
import { OTT_INGEST_CARDS, OTT_INGEST_SPEC } from "./ott-ingest-spec.ts";

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

test("bridge_assets permits all canonical ASSET_KINDS after forward migration", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_assets_kinds.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type)
      values ('title-kinds','title-kinds','Title Kinds','creator','independent_creator');`);

    for (const kind of ASSET_KINDS) {
      await db.exec(`insert into bridge_assets (id, title_id, kind, s3_key, created_by)
        values ('asset-${kind}', 'title-kinds', '${kind}', 'key-${kind}', 'creator');`);
    }
    const count = (await db.query<{ count: number }>("select count(*)::int as count from bridge_assets where title_id='title-kinds'")).rows[0]?.count;
    assert.equal(count, ASSET_KINDS.length);

    // Negative tests: unsupported kinds must be rejected by bridge_assets_kind_chk
    const invalidKinds = ["unsupported_video_format", "exe", "raw", "invalid_kind", "executable"];
    for (const invalid of invalidKinds) {
      await assert.rejects(
        async () => {
          await db.exec(`insert into bridge_assets (id, title_id, kind, s3_key, created_by)
            values ('asset-${invalid}', 'title-kinds', '${invalid}', 'key-${invalid}', 'creator');`);
        },
        (err: Error) => {
          assert.match(err.message, /bridge_assets_kind_chk/);
          return true;
        },
        `Unsupported asset kind '${invalid}' must be rejected by check constraint`,
      );
    }
  } finally {
    await db.close();
  }
});

test("fresh database replays original 0004_bridge.sql followed by forward migration to permit all 9 kinds", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    // 1. Replay original 0004_bridge.sql baseline
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type)
      values ('title-fresh','title-fresh','Fresh Title','creator','independent_creator');`);

    // Verify original 0004 constraint permits original kind (poster) but rejects new kind (poster_vertical)
    await db.exec(`insert into bridge_assets (id, title_id, kind, s3_key, created_by)
      values ('fresh-poster', 'title-fresh', 'poster', 'fresh-key-poster', 'creator');`);

    await assert.rejects(
      async () => {
        await db.exec(`insert into bridge_assets (id, title_id, kind, s3_key, created_by)
          values ('fresh-vertical', 'title-fresh', 'poster_vertical', 'fresh-key-vertical', 'creator');`);
      },
      (err: Error) => {
        assert.match(err.message, /bridge_assets_kind_chk/);
        return true;
      },
      "Original 0004 constraint must reject poster_vertical before forward migration is applied",
    );

    // 2. Replay forward migration 0021_bridge_assets_kinds.sql
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_assets_kinds.sql"), "utf8"));

    // 3. Verify all 9 canonical kinds succeed after forward migration
    for (const kind of ASSET_KINDS) {
      if (kind === "poster") continue; // already inserted before migration
      await db.exec(`insert into bridge_assets (id, title_id, kind, s3_key, created_by)
        values ('fresh-${kind}', 'title-fresh', '${kind}', 'fresh-key-${kind}', 'creator');`);
    }
    const count = (await db.query<{ count: number }>("select count(*)::int as count from bridge_assets where title_id='title-fresh'")).rows[0]?.count;
    assert.equal(count, ASSET_KINDS.length);

    // 4. Verify existing valid rows remain intact
    const existingRow = (await db.query<{ id: string; kind: string }>("select id, kind from bridge_assets where id='fresh-poster'")).rows[0];
    assert.deepEqual(existingRow, { id: "fresh-poster", kind: "poster" });

    // 5. Verify invalid kinds remain rejected
    await assert.rejects(
      async () => {
        await db.exec(`insert into bridge_assets (id, title_id, kind, s3_key, created_by)
          values ('fresh-invalid', 'title-fresh', 'not_a_real_kind', 'fresh-key-invalid', 'creator');`);
      },
      (err: Error) => {
        assert.match(err.message, /bridge_assets_kind_chk/);
        return true;
      },
      "Unsupported asset kind must be rejected by forward migration check constraint",
    );
  } finally {
    await db.close();
  }
});

test("forward migration safely fails and preserves existing rows if unexpected asset kinds are found", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    // Create bridge_titles and bridge_assets without kind constraint to simulate legacy/unconstrained dirty rows
    await db.exec(`
      create table bridge_titles (
        id text primary key,
        slug text unique not null,
        name text not null,
        owner_user_id text not null,
        owner_account_type text not null,
        status text not null default 'DRAFT',
        poster_key text,
        master_key text,
        updated_at timestamptz not null default now()
      );
      create table bridge_assets (
        id text primary key,
        title_id text not null references bridge_titles (id) on delete cascade,
        kind text not null,
        s3_key text not null unique,
        created_by text not null
      );
      insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type)
      values ('title-dirty', 'title-dirty', 'Dirty Title', 'creator', 'independent_creator');
      insert into bridge_assets (id, title_id, kind, s3_key, created_by)
      values
        ('valid-1', 'title-dirty', 'poster', 'key-poster', 'creator'),
        ('valid-2', 'title-dirty', 'master', 'key-master', 'creator'),
        ('dirty-1', 'title-dirty', 'unexpected_legacy_kind', 'key-dirty', 'creator');
    `);

    // Applying forward migration 0021 must abort safely with exception
    await assert.rejects(
      async () => {
        await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_assets_kinds.sql"), "utf8"));
      },
      (err: Error) => {
        assert.match(err.message, /unexpected_legacy_kind/);
        assert.match(err.message, /Migration aborted/);
        return true;
      },
      "Forward migration must fail safely when unexpected kinds exist",
    );

    // Existing rows must be completely preserved
    const rows = (await db.query<{ id: string; kind: string }>("select id, kind from bridge_assets order by id")).rows;
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.id), ["dirty-1", "valid-1", "valid-2"]);

    // Test Supabase forward migration has identical safe-fail behavior
    await assert.rejects(
      async () => {
        await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261014100000_bridge_assets_kinds.sql"), "utf8"));
      },
      (err: Error) => {
        assert.match(err.message, /unexpected_legacy_kind/);
        assert.match(err.message, /Migration aborted/);
        return true;
      },
      "Supabase forward migration must fail safely when unexpected kinds exist",
    );
  } finally {
    await db.close();
  }
});

test("forward migration succeeds and preserves valid existing rows", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(`
      create table bridge_titles (
        id text primary key,
        slug text unique not null,
        name text not null,
        owner_user_id text not null,
        owner_account_type text not null,
        status text not null default 'DRAFT',
        poster_key text,
        master_key text,
        updated_at timestamptz not null default now()
      );
      create table bridge_assets (
        id text primary key,
        title_id text not null references bridge_titles (id) on delete cascade,
        kind text not null,
        s3_key text not null unique,
        created_by text not null
      );
      insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type)
      values ('title-clean', 'title-clean', 'Clean Title', 'creator', 'independent_creator');
      insert into bridge_assets (id, title_id, kind, s3_key, created_by)
      values
        ('clean-1', 'title-clean', 'poster', 'key-poster-1', 'creator'),
        ('clean-2', 'title-clean', 'master', 'key-master-1', 'creator');
    `);

    // Applying forward migration 0021 must succeed
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_assets_kinds.sql"), "utf8"));

    const rows = (await db.query<{ id: string; kind: string }>("select id, kind from bridge_assets order by id")).rows;
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.id), ["clean-1", "clean-2"]);

    // Applying Supabase forward migration must also be idempotent and succeed
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261014100000_bridge_assets_kinds.sql"), "utf8"));
  } finally {
    await db.close();
  }
});

test("verifying poster_vertical populates poster_key on bridge_titles", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_assets_kinds.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type)
      values ('title-vertical', 'title-vertical', 'Vertical Title', 'creator', 'independent_creator');
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values ('asset-vert-1', 'title-vertical', 'poster_vertical', 'bridge/creator/title-vertical/poster_vertical/art.png', 'image/png', 'creator');`);
    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const success = await persistVerifiedAsset(sql, {
      assetId: "asset-vert-1",
      actorUserId: "creator",
      internalActor: false,
      titleId: "title-vertical",
      kind: "poster_vertical",
      byteSize: 2048,
      contentType: "image/png",
      checksum: "etag-vert",
      sourceKey: "bridge/creator/title-vertical/poster_vertical/art.png",
      sealedKey: "bridge/creator/title-vertical/poster_vertical/art.png.verified/uuid-vert",
    });
    assert.equal(success, true);
    const title = (await db.query<{ poster_key: string | null }>(
      "select poster_key from bridge_titles where id = 'title-vertical'",
    )).rows[0];
    assert.equal(title?.poster_key, "bridge/creator/title-vertical/poster_vertical/art.png.verified/uuid-vert");
  } finally {
    await db.close();
  }
});

test("verifying legacy poster kind populates poster_key on bridge_titles", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_assets_kinds.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type)
      values ('title-poster', 'title-poster', 'Poster Title', 'creator', 'independent_creator');
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values ('asset-post-1', 'title-poster', 'poster', 'bridge/creator/title-poster/poster/art.png', 'image/png', 'creator');`);
    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };
    const success = await persistVerifiedAsset(sql, {
      assetId: "asset-post-1",
      actorUserId: "creator",
      internalActor: false,
      titleId: "title-poster",
      kind: "poster",
      byteSize: 4096,
      contentType: "image/png",
      checksum: "etag-post",
      sourceKey: "bridge/creator/title-poster/poster/art.png",
      sealedKey: "bridge/creator/title-poster/poster/art.png.verified/uuid-post",
    });
    assert.equal(success, true);
    const title = (await db.query<{ poster_key: string | null }>(
      "select poster_key from bridge_titles where id = 'title-poster'",
    )).rows[0];
    assert.equal(title?.poster_key, "bridge/creator/title-poster/poster/art.png.verified/uuid-post");
  } finally {
    await db.close();
  }
});

test("confirming non-poster and non-master kinds does not touch master_key or poster_key", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    await db.exec(readFileSync(join(process.cwd(), "migrations/0004_bridge.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "migrations/0021_bridge_assets_kinds.sql"), "utf8"));
    await db.exec(`insert into bridge_titles (id, slug, name, owner_user_id, owner_account_type)
      values ('title-aux', 'title-aux', 'Aux Title', 'creator', 'independent_creator');`);

    const auxKinds = [
      "poster_horizontal",
      "thumbnail",
      "screener",
      "subtitle",
      "technical",
      "censor_certificate",
    ];

    const sql = { query: async <T>(query: string, params: unknown[]) => (await db.query<T>(query, params)).rows };

    for (const kind of auxKinds) {
      const assetId = `asset-aux-${kind}`;
      const sourceKey = `bridge/creator/title-aux/${kind}/file.bin`;
      const sealedKey = `${sourceKey}.verified/uuid`;
      await db.exec(`insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
        values ('${assetId}', 'title-aux', '${kind}', '${sourceKey}', 'application/octet-stream', 'creator');`);

      const confirmed = await persistVerifiedAsset(sql, {
        assetId,
        actorUserId: "creator",
        internalActor: false,
        titleId: "title-aux",
        kind,
        byteSize: 1024,
        contentType: "application/octet-stream",
        checksum: `etag-${kind}`,
        sourceKey,
        sealedKey,
      });
      assert.equal(confirmed, true);

      const title = (await db.query<{ master_key: string | null; poster_key: string | null }>(
        "select master_key, poster_key from bridge_titles where id = 'title-aux'",
      )).rows[0];
      assert.equal(title?.master_key, null, `${kind} must not set master_key`);
      assert.equal(title?.poster_key, null, `${kind} must not set poster_key`);
    }
  } finally {
    await db.close();
  }
});

test("artwork and document upload fields map correctly to intended asset kinds", () => {
  const cardMap = Object.fromEntries(OTT_INGEST_CARDS.map(([kind, label]) => [label, kind]));
  assert.equal(cardMap["Main Film"], "master", "Main Film must map to master");
  assert.equal(cardMap["Trailer"], "screener", "Trailer must map to screener");
  assert.equal(cardMap["Vertical Poster"], "poster_vertical", "Vertical Poster must map to poster_vertical");
  assert.equal(cardMap["Horizontal Artwork"], "poster_horizontal", "Horizontal Artwork must map to poster_horizontal");
  assert.equal(cardMap["Thumbnail"], "thumbnail", "Thumbnail must map to thumbnail");
  assert.equal(cardMap["Subtitle"], "subtitle", "Subtitle must map to subtitle");
  assert.equal(cardMap["Technical Package"], "technical", "Technical Package must map to technical");
  assert.equal(cardMap["Censor Certificate"], "censor_certificate", "Censor Certificate must map to censor_certificate");

  // Verify OTT Ingest Spec rules exist and map to each canonical kind
  for (const kind of ASSET_KINDS) {
    const spec = OTT_INGEST_SPEC[kind];
    assert.ok(spec, `OTT_INGEST_SPEC must define rule for ${kind}`);
    assert.ok(spec.label, `OTT_INGEST_SPEC[${kind}] must have a human-readable label`);
    assert.ok(spec.extensions.length > 0, `OTT_INGEST_SPEC[${kind}] must have extensions`);
    assert.ok(spec.mimeTypes.length > 0, `OTT_INGEST_SPEC[${kind}] must have mimeTypes`);
  }
});
