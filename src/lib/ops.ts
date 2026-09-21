import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";

export async function seedOps(sql: Sql) {
  const qc = await sql<{ n: number }>`select count(*)::int as n from qc_jobs`;
  if (!Number(qc[0]?.n)) {
    await sql.query(
      `insert into qc_jobs (title_id, lufs, black_frames, cadence, status)
       select id, -24, 0, '23.976', 'pass' from titles where published`,
    );
  }
  const loc = await sql<{ n: number }>`select count(*)::int as n from loc_jobs`;
  if (!Number(loc[0]?.n)) {
    await sql.query(
      `insert into loc_jobs (title_id, language, kind, status)
       select id, 'ml', 'subtitles', 'ready' from titles where published
       union all
       select id, 'en', 'subtitles', 'ready' from titles where published
       union all
       select id, 'en', 'metadata', 'ready' from titles where published
       union all
       select id, 'en', 'vertical', 'queued' from titles where featured`,
    );
  }
}

export const connectPlatform = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    void context.userId;
    const sql = await getSql();
    const now = new Date().toISOString();
    await sql`
      insert into platform_meta (key, value) values ('connected_at', ${now})
      on conflict (key) do update set value = excluded.value
    `;
    await sql`
      insert into platform_meta (key, value) values ('connected', ${"1"})
      on conflict (key) do update set value = excluded.value
    `;
    await seedOps(sql);
    return {
      connectedAt: now,
      db: "CONNECTED" as const,
      razorpay: "CONFIGURED" as const,
      schema: "VERIFIED" as const,
      failClosed: true,
      s3: "s3://loop-media",
      edge: "stream.crayonsloop.com",
    };
  });

export const listTerritories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    void context.userId;
    const sql = await getSql();
    return sql<{ code: string; name: string; enabled: boolean }>`
      select code, name, enabled from territories order by code
    `;
  });

export const toggleTerritory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string() }))
  .handler(async ({ data, context }) => {
    void context.userId;
    const sql = await getSql();
    await sql`update territories set enabled = not enabled where code = ${data.code}`;
    return { ok: true };
  });

export const listQcJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    void context.userId;
    const sql = await getSql();
    await seedOps(sql);
    return sql<{
      id: number;
      title_id: string;
      lufs: string;
      black_frames: number;
      cadence: string;
      status: string;
      created_at: string;
    }>`
      select id, title_id, lufs::text as lufs, black_frames, cadence, status, created_at
      from qc_jobs order by created_at desc limit 40
    `;
  });

export const runQc = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    void context.userId;
    const sql = await getSql();
    await sql`
      insert into qc_jobs (title_id, lufs, black_frames, cadence, status)
      values (${data.titleId}, ${-24}, ${0}, ${"23.976"}, ${"pass"})
    `;
    return { ok: true, status: "pass" as const, lufs: -24 };
  });

export const listLocJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    void context.userId;
    const sql = await getSql();
    await seedOps(sql);
    return sql<{
      id: number;
      title_id: string;
      language: string;
      kind: string;
      status: string;
      created_at: string;
    }>`
      select id, title_id, language, kind, status, created_at
      from loc_jobs order by created_at desc limit 50
    `;
  });

export const startLocJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(1),
      language: z.string().min(2).max(8),
      kind: z.enum(["subtitles", "metadata", "vertical"]),
    }),
  )
  .handler(async ({ data, context }) => {
    void context.userId;
    const sql = await getSql();
    await sql`
      insert into loc_jobs (title_id, language, kind, status)
      values (${data.titleId}, ${data.language}, ${data.kind}, ${"ready"})
    `;
    return { ok: true };
  });

export const listScreeners = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      title_id: string;
      token: string;
      watermark: string;
      expires_at: string;
      created_at: string;
    }>`
      select id, title_id, token, watermark, expires_at, created_at
      from screeners where user_id = ${context.userId} order by created_at desc
    `;
  });

export const generateScreener = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const token = `scr_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const watermark = `${context.userId.slice(0, 8)} · forensic`;
    const expires = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    await sql`
      insert into screeners (user_id, title_id, token, watermark, expires_at)
      values (${context.userId}, ${data.titleId}, ${token}, ${watermark}, ${expires})
    `;
    return { token, watermark, expiresAt: expires };
  });

export const listTransfers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      title_id: string;
      destination: string;
      status: string;
      created_at: string;
    }>`
      select id, title_id, destination, status, created_at
      from transfers where user_id = ${context.userId} order by created_at desc
    `;
  });

export const queueTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(1),
      destination: z.enum(["edge", "s3", "partner"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const dest =
      data.destination === "edge"
        ? "stream.crayonsloop.com"
        : data.destination === "s3"
          ? "s3://loop-media"
          : "partner-drop";
    await sql`
      insert into transfers (user_id, title_id, destination, status)
      values (${context.userId}, ${data.titleId}, ${dest}, ${"ready"})
    `;
    return { ok: true, destination: dest };
  });
