import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { loadTitle } from "./titles";
import { requireVerifiedActor } from "./session";
import { hasPermission } from "./rbac";

const BUCKET = "bridge-simple";
const STAFF = new Set(["admin", "super_admin", "qc_reviewer"]);

function isStaff(role: string | null | undefined) {
  return Boolean(role && STAFF.has(role));
}

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

export const prepareSimpleUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    filename: z.string().min(1).max(160),
    contentType: z.string().min(3).max(120),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) throw new Error("Forbidden");
    await ensureSimpleStorage();
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "file";
    const path = `${actor.userId}/${title.id}/${Date.now()}-${safe}`;
    return { bucket: BUCKET, path, contentType: data.contentType };
  });

export const confirmSimpleUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    path: z.string().min(8).max(300),
    contentType: z.string().min(3).max(120),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (!data.path.startsWith(`${actor.userId}/${title.id}/`)) throw new Error("Upload path is not yours");
    const staff = isStaff(actor.internalRole);
    if (!staff && title.ownerUserId !== actor.userId) throw new Error("Forbidden");
    const sql = await getSql();
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, byte_size, created_by)
      values (${id}, ${title.id}, 'master', ${data.path}, ${data.contentType}, ${data.byteSize}, ${actor.userId})
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
      supabaseUrl: bridgeEnv.supabaseUrl() ?? null,
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
