import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { loadTitle } from "./titles";
import { requireVerifiedActor } from "./session";
import { deleteObject, signDownload, signUpload, titleAssetKey, verifyObject } from "./oci-object-storage.server";
import { hasPermission } from "./rbac";

const BUCKET = "bridge-simple";
const STAFF = new Set(["admin", "super_admin", "qc_reviewer"]);

function isStaff(role: string | null | undefined) {
  return Boolean(role && STAFF.has(role));
}

function isAdmin(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

export const matchTitleStorage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isStaff(actor.internalRole)) throw new Error("Only staff can check storage");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const sql = await getSql();
    const rows = await sql<{ id: string; s3_key: string }>`
      select id, s3_key from bridge_assets
      where title_id = ${title.id} and coalesce(byte_size, 0) = 0 and s3_key like 'bridge/%'
      order by created_at desc
      limit 8
    `;
    let found = 0;
    for (const row of rows) {
      try {
        const object = await verifyObject(row.s3_key);
        await sql`
          update bridge_assets
          set byte_size = ${object.byteSize}, content_type = coalesce(content_type, ${object.contentType})
          where id = ${row.id}
        `;
        found += 1;
      } catch {
        // The row stays unfinished. Oracle did not have this object.
      }
    }
    return { found, checked: rows.length };
  });

export const deleteTitleAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isAdmin(actor.internalRole)) throw new Error("Only an admin can delete a file");
    const sql = await getSql();
    const rows = await sql<{ id: string; title_id: string; s3_key: string }>`
      select id, title_id, s3_key from bridge_assets where id = ${data.assetId} limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Not found");
    if (asset.s3_key.startsWith("bridge/")) {
      try {
        await deleteObject(asset.s3_key);
      } catch (error) {
        console.error("[bridge] storage delete skipped", error instanceof Error ? error.message : error);
      }
    }
    await sql`delete from bridge_assets where id = ${asset.id}`;
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.deleted",
      entityType: "bridge_asset",
      entityId: asset.id,
      metadata: { titleId: asset.title_id },
    });
    return { id: asset.id };
  });

export const deleteUnfinishedAssets = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isAdmin(actor.internalRole)) throw new Error("Only an admin can delete unfinished files");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const sql = await getSql();
    const rows = await sql<{ id: string; s3_key: string }>`
      select id, s3_key from bridge_assets
      where title_id = ${title.id} and coalesce(byte_size, 0) = 0
      limit 40
    `;
    for (const row of rows) {
      if (row.s3_key.startsWith("bridge/")) {
        try {
          await deleteObject(row.s3_key);
        } catch {
          // Keep going. The record is the clutter the admin asked to remove.
        }
      }
      await sql`delete from bridge_assets where id = ${row.id}`;
    }
    return { deleted: rows.length };
  });

async function ensureNotes() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists bridge_desk_notes (
      id text primary key,
      title_id text not null references bridge_titles (id) on delete cascade,
      actor_user_id text not null,
      action text not null,
      body text not null,
      mailed boolean not null default false,
      created_at timestamptz not null default now()
    )
  `);
  return sql;
}

async function ensureSimpleStorage() {
  const sql = await ensureNotes();
  try {
    await sql`
      insert into storage.buckets (id, name, public, file_size_limit)
      values (${BUCKET}, ${BUCKET}, false, ${200 * 1024 * 1024})
      on conflict (id) do update set file_size_limit = excluded.file_size_limit
    `;
  } catch {
    await sql`
      insert into storage.buckets (id, name, public)
      values (${BUCKET}, ${BUCKET}, false)
      on conflict (id) do nothing
    `;
  }
  await sql.query("drop policy if exists bridge_simple_insert on storage.objects");
  await sql.query("drop policy if exists bridge_simple_select on storage.objects");
  await sql.query(`
    create policy bridge_simple_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'bridge-simple'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  `);
  await sql.query(`
    create policy bridge_simple_select on storage.objects
    for select to authenticated
    using (
      bucket_id = 'bridge-simple'
      and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (
          select 1 from public.bridge_titles t
          where t.id = (storage.foldername(name))[2]
            and t.owner_user_id = auth.uid()::text
        )
        or exists (
          select 1 from public.bridge_profiles p
          where p.user_id = auth.uid()::text
            and p.internal_role in ('admin', 'super_admin', 'qc_reviewer')
        )
      )
    )
  `);
}

async function mailPeople(to: string[], subject: string, text: string) {
  const unique = [...new Set(to.map((v) => v.trim()).filter(Boolean))];
  if (!unique.length) return false;
  try {
    const { sendTransactionalEmail } = await import("./mail.server");
    await Promise.all(unique.map((address) => sendTransactionalEmail({ to: address, subject, text })));
    return true;
  } catch (error) {
    console.error("[bridge] desk mail skipped", error instanceof Error ? error.message : error);
    return false;
  }
}

export const listGalleryFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType === "buyer" && !actor.internalRole) return { files: [] };
    const sql = await getSql();
    const staff = Boolean(actor.internalRole && hasPermission(actor, "title.read_catalog"));
    const rows = staff
      ? await sql<{ title_id: string; byte_size: number | null }>`
          select distinct on (title_id) title_id, byte_size
          from bridge_assets
          where kind = 'master' and coalesce(byte_size, 0) > 0
          order by title_id, created_at desc
        `
      : await sql<{ title_id: string; byte_size: number | null }>`
          select distinct on (a.title_id) a.title_id, a.byte_size
          from bridge_assets a
          join bridge_titles t on t.id = a.title_id
          where a.kind = 'master'
            and coalesce(a.byte_size, 0) > 0
            and t.owner_user_id = ${actor.userId}
          order by a.title_id, a.created_at desc
        `;
    return {
      files: rows.map((row) => ({ titleId: row.title_id, byteSize: Number(row.byte_size ?? 0) })),
    };
  });

const FILE_KINDS = ["master", "trailer", "poster", "poster_vertical", "poster_horizontal", "thumbnail", "subtitle", "audio", "screener", "censor_certificate"] as const;

async function widenAssetKinds(sql: Awaited<ReturnType<typeof getSql>>) {
  await sql.query(`
    alter table bridge_assets drop constraint if exists bridge_assets_kind_chk;
    alter table bridge_assets add constraint bridge_assets_kind_chk check (
      kind in (
        'poster', 'poster_vertical', 'poster_horizontal', 'thumbnail',
        'screener', 'master', 'trailer', 'subtitle', 'audio', 'censor_certificate', 'technical'
      )
    );
  `);
}

export const prepareSimpleUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    filename: z.string().min(1).max(160),
    contentType: z.string().min(3).max(120),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024),
    kind: z.enum(FILE_KINDS).default("master"),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) throw new Error("Forbidden");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "file";
    const path = titleAssetKey({
      ownerUserId: actor.userId,
      titleId: title.id,
      kind: data.kind,
      filename: safe,
    });
    const signed = await signUpload({ key: path, contentType: data.contentType });
    return { url: signed.url, path, method: "PUT" as const };
  });

export const confirmSimpleUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    path: z.string().min(8).max(500),
    contentType: z.string().min(3).max(120),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024),
    kind: z.enum(FILE_KINDS).default("master"),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (!data.path.startsWith(`bridge/${actor.userId}/${title.id}/`)) throw new Error("Upload path is not yours");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) throw new Error("Forbidden");
    const verified = await verifyObject(data.path, data.contentType);
    const sql = await getSql();
    await widenAssetKinds(sql);
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, byte_size, created_by)
      values (${id}, ${title.id}, ${data.kind}, ${data.path}, ${verified.contentType || data.contentType}, ${verified.byteSize}, ${actor.userId})
    `;
    const noteId = randomBytes(16).toString("hex");
    const admins = await sql<{ email: string }>`
      select email from bridge_profiles
      where internal_role in ('admin', 'super_admin', 'qc_reviewer')
    `;
    const mailed = await mailPeople(
      admins.map((row) => row.email),
      `File ready · ${title.name}`,
      `${actor.displayName || actor.email} uploaded a file for “${title.name}”. Open https://www.crayonspictures.in/title/${title.id}`,
    );
    await sql`
      insert into bridge_desk_notes (id, title_id, actor_user_id, action, body, mailed)
      values (${noteId}, ${title.id}, ${actor.userId}, 'upload', ${"File uploaded."}, ${mailed})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.simple_upload",
      entityType: "bridge_asset",
      entityId: id,
      metadata: { titleId: title.id },
    });
    return { assetId: id, path: data.path, mailed };
  });

export const openTitleAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{ title_id: string; s3_key: string; byte_size: number | null; owner_user_id: string }>`
      select a.title_id, a.s3_key, a.byte_size, t.owner_user_id
      from bridge_assets a
      join bridge_titles t on t.id = a.title_id
      where a.id = ${data.assetId}
      limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Not found");
    const staff = isStaff(actor.internalRole);
    if (!staff && asset.owner_user_id !== actor.userId) throw new Error("Forbidden");
    if (!(Number(asset.byte_size) > 0)) throw new Error("Still saving this file.");
    if (!asset.s3_key.startsWith("bridge/")) throw new Error("This file is not in Oracle storage.");
    const signed = await signDownload({ key: asset.s3_key, expiresIn: 600 });
    return { url: signed.url };
  });

export const openSimpleFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) throw new Error("Forbidden");
    const sql = await getSql();
    const rows = await sql<{ s3_key: string }>`
      select s3_key from bridge_assets
      where title_id = ${title.id} and kind = 'master' and coalesce(byte_size, 0) > 0
      order by created_at desc
      limit 1
    `;
    const key = rows[0]?.s3_key;
    if (!key) throw new Error("No file yet");
    if (!key.startsWith("bridge/")) throw new Error("This file is not in Oracle storage");
    const signed = await signDownload({ key, expiresIn: 600 });
    return { url: signed.url };
  });

export const getSimpleDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) throw new Error("Not found");
    const sql = await ensureNotes();
    const assets = await sql<{
      id: string;
      s3_key: string;
      content_type: string | null;
      byte_size: number | null;
      created_at: string | Date;
    }>`
      select id, s3_key, content_type, byte_size, created_at
      from bridge_assets
      where title_id = ${title.id} and kind = 'master' and coalesce(byte_size, 0) > 0
      order by created_at desc
      limit 5
    `;
    const notes = await sql<{
      id: string;
      action: string;
      body: string;
      actor_user_id: string;
      mailed: boolean;
      created_at: string | Date;
      display_name: string | null;
    }>`
      select n.id, n.action, n.body, n.actor_user_id, n.mailed, n.created_at, p.display_name
      from bridge_desk_notes n
      left join bridge_profiles p on p.user_id = n.actor_user_id
      where n.title_id = ${title.id}
      order by n.created_at desc
      limit 30
    `;
    const asIso = (v: string | Date) => (v instanceof Date ? v.toISOString() : String(v));
    return {
      bucket: BUCKET,
      staff,
      file: assets[0]
        ? {
            id: assets[0].id,
            path: assets[0].s3_key,
            contentType: assets[0].content_type,
            byteSize: Number(assets[0].byte_size),
            createdAt: asIso(assets[0].created_at),
          }
        : null,
      notes: notes.map((n) => ({
        id: n.id,
        action: n.action,
        body: n.body,
        actor: n.display_name || "Bridge",
        mailed: n.mailed,
        createdAt: asIso(n.created_at),
      })),
    };
  });

export const postSimpleDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    action: z.enum(["park", "approve", "replace", "note"]),
    body: z.string().trim().min(1).max(1000),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) throw new Error("Forbidden");
    if (data.action !== "note" && !staff) throw new Error("Only admin can park, approve, or request a replace");
    const sql = await ensureNotes();
    const owner = await sql<{ email: string }>`
      select email from bridge_profiles where user_id = ${title.ownerUserId} limit 1
    `;
    const label = data.action === "park" ? "Parked" : data.action === "approve" ? "Approved" : data.action === "replace" ? "Replace requested" : "Note";
    const mailed = await mailPeople(
      [owner[0]?.email ?? ""],
      `${label} · ${title.name}`,
      `${label} by ${actor.displayName || actor.email}: ${data.body}\n\nhttps://www.crayonspictures.in/title/${title.id}`,
    );
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_desk_notes (id, title_id, actor_user_id, action, body, mailed)
      values (${id}, ${title.id}, ${actor.userId}, ${data.action}, ${data.body}, ${mailed})
    `;
    return { id, mailed };
  });

export const listDeskOffers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) return { offers: [] };
    const sql = await getSql();
    await sql.query(`
      create table if not exists bridge_desk_offers (
        id text primary key,
        title_id text not null,
        kind text not null,
        partner text,
        charge_paise integer not null default 0,
        status text not null,
        note text not null,
        created_at timestamptz not null default now()
      )
    `);
    const rows = await sql<{ id: string; kind: string; partner: string | null; charge_paise: number; status: string; note: string }>`
      select id, kind, partner, charge_paise, status, note
      from bridge_desk_offers
      where title_id = ${title.id}
      order by created_at desc
      limit 20
    `;
    return {
      offers: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        partner: row.partner || "",
        chargePaise: Number(row.charge_paise),
        status: row.status,
        note: row.note,
      })),
    };
  });

export const postDeskOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    kind: z.enum(["qc", "mastering", "conversion", "pitch"]),
    partner: z.string().trim().max(80).optional(),
    chargePaise: z.number().int().min(0).max(100_000_000).default(0),
    status: z.enum(["offered", "interested", "rejected", "done"]),
    note: z.string().trim().min(2).max(500),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isStaff(actor.internalRole)) throw new Error("Only staff can post a desk update");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const sql = await getSql();
    await sql.query(`
      create table if not exists bridge_desk_offers (
        id text primary key,
        title_id text not null,
        kind text not null,
        partner text,
        charge_paise integer not null default 0,
        status text not null,
        note text not null,
        created_at timestamptz not null default now()
      )
    `);
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_desk_offers (id, title_id, kind, partner, charge_paise, status, note)
      values (${id}, ${title.id}, ${data.kind}, ${data.partner || null}, ${data.chargePaise}, ${data.status}, ${data.note})
    `;
    const owner = await sql<{ email: string }>`
      select email from bridge_profiles where user_id = ${title.ownerUserId} limit 1
    `;
    const label = data.kind === "pitch" ? `Pitch ${data.status}` : data.kind;
    await mailPeople(
      [owner[0]?.email ?? ""],
      `${label} · ${title.name}`,
      `${label}${data.partner ? ` · ${data.partner}` : ""}. ${data.chargePaise > 0 ? `Bridge charge ₹${Math.round(data.chargePaise / 100)}.` : "No charge."} ${data.note}`,
    );
    await writeAudit({
      actorUserId: actor.userId,
      action: "desk.offer",
      entityType: "bridge_desk_offer",
      entityId: id,
      metadata: { titleId: title.id, kind: data.kind, status: data.status, chargePaise: data.chargePaise },
    });
    return { id };
  });
