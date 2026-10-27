import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { signDownload, signUpload, verifyObject } from "./oci-object-storage.server";
import { requireVerifiedActor } from "./session";

const AREAS = ["working", "archive", "keep"] as const;
const SLOTS = ["raw", "stills", "pilot", "picture", "sound", "catalog", "hold"] as const;

async function requireStudio(userId: string) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  if (actor.accountType !== "studio" && actor.accountType !== "independent_creator" && !actor.internalRole) {
    throw new Error("Storage is for creator and studio accounts.");
  }
  return actor;
}

async function db() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists bridge_studio_files (
      id text primary key,
      owner_user_id text not null,
      title_name text not null,
      area text not null,
      slot text not null,
      day_label text,
      card_label text,
      s3_key text not null,
      content_type text,
      byte_size integer,
      created_at timestamptz not null default now()
    )
  `);
  return sql;
}

export const listStudioFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireStudio(context.userId);
    const sql = await db();
    const rows = await sql<{
      id: string;
      title_name: string;
      area: string;
      slot: string;
      day_label: string | null;
      card_label: string | null;
      byte_size: number | null;
      created_at: string | Date;
    }>`
      select id, title_name, area, slot, day_label, card_label, byte_size, created_at
      from bridge_studio_files
      where owner_user_id = ${actor.userId}
      order by created_at desc
      limit 80
    `;
    const used = await sql<{ bytes: number | string | null }>`
      select coalesce(sum(byte_size), 0) as bytes
      from bridge_studio_files
      where owner_user_id = ${actor.userId} and coalesce(byte_size, 0) > 0
    `;
    const onTitles = await sql<{ bytes: number | string | null }>`
      select coalesce(sum(a.byte_size), 0) as bytes
      from bridge_assets a
      join bridge_titles t on t.id = a.title_id
      where t.owner_user_id = ${actor.userId} and coalesce(a.byte_size, 0) > 0
    `;
    return {
      usedBytes: Number(used[0]?.bytes ?? 0),
      titleBytes: Number(onTitles[0]?.bytes ?? 0),
      files: rows.map((row) => ({
        id: row.id,
        titleName: row.title_name,
        area: row.area,
        slot: row.slot,
        day: row.day_label,
        card: row.card_label,
        byteSize: Number(row.byte_size ?? 0),
        pending: !(Number(row.byte_size) > 0),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
    };
  });

export const prepareStudioUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleName: z.string().trim().min(1).max(160),
    area: z.enum(AREAS),
    slot: z.enum(SLOTS),
    day: z.string().trim().max(40).optional(),
    card: z.string().trim().max(40).optional(),
    filename: z.string().min(1).max(160),
    contentType: z.string().min(3).max(120),
    byteSize: z.number().int().positive().max(200 * 1024 * 1024),
  }))
  .handler(async ({ context, data }) => {
    const actor = await requireStudio(context.userId);
    const id = randomBytes(16).toString("hex");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "file";
    const key = `bridge/${actor.userId}/studio/${data.area}/${id}-${safe}`;
    const signed = await signUpload({ key, contentType: data.contentType });
    const sql = await db();
    await sql`
      insert into bridge_studio_files
        (id, owner_user_id, title_name, area, slot, day_label, card_label, s3_key, content_type)
      values
        (${id}, ${actor.userId}, ${data.titleName}, ${data.area}, ${data.slot}, ${data.day || null}, ${data.card || null}, ${key}, ${data.contentType})
    `;
    return { id, url: signed.url, method: "PUT" as const };
  });

export const confirmStudioUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireStudio(context.userId);
    const sql = await db();
    const rows = await sql<{ s3_key: string; content_type: string | null }>`
      select s3_key, content_type from bridge_studio_files
      where id = ${data.id} and owner_user_id = ${actor.userId}
      limit 1
    `;
    const file = rows[0];
    if (!file) throw new Error("Not found");
    const verified = await verifyObject(file.s3_key, file.content_type);
    await sql`
      update bridge_studio_files
      set byte_size = ${verified.byteSize}, content_type = ${verified.contentType || file.content_type}
      where id = ${data.id}
    `;
    return { id: data.id, byteSize: verified.byteSize };
  });

export const openStudioFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireStudio(context.userId);
    const sql = await db();
    const rows = await sql<{ s3_key: string; byte_size: number | null }>`
      select s3_key, byte_size from bridge_studio_files
      where id = ${data.id} and owner_user_id = ${actor.userId}
      limit 1
    `;
    const file = rows[0];
    if (!file || !(Number(file.byte_size) > 0)) throw new Error("Still saving this file.");
    const signed = await signDownload({ key: file.s3_key, expiresIn: 600 });
    return { url: signed.url };
  });
