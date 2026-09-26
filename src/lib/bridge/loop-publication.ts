import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

type PublicationRow = {
  bridge_title_id: string;
  loop_title_id: string;
  authorization_status: string;
  territories: string[];
  languages: string[];
  exploitation_models: string[];
  window_start: string | Date | null;
  window_end: string | Date | null;
  approved_at: string | Date | null;
  revoked_at: string | Date | null;
  loop_status: string;
  listed: boolean;
  published: boolean;
  playback_path: string | null;
};

const publishInput = z.object({
  bridgeTitleId: z.string().min(1),
  territories: z.array(z.string().min(2).max(32)).min(1).max(50),
  languages: z.array(z.string().min(2).max(40)).min(1).max(20),
  exploitationModels: z.array(z.enum(["SVOD", "TVOD", "FREE"])).min(1).max(3),
  windowStart: z.string().datetime().nullable().optional(),
  windowEnd: z.string().datetime().nullable().optional(),
  accessTier: z.enum(["FREE", "SVOD", "TVOD"]),
});

function iso(v: string | Date | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export const listLoopPublicationReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    const rows = await sql<{
      id: string; slug: string; name: string; status: string; language: string;
      master_key: string | null; poster_key: string | null; synopsis: string;
      year: number | null; runtime_minutes: number | null;
      loop_title_id: string | null; authorization_status: string | null;
      loop_status: string | null; listed: boolean | null; published: boolean | null;
      playback_path: string | null;
    }>`
      select b.id, b.slug, b.name, b.status, b.language, b.master_key, b.poster_key,
             b.synopsis, b.year, b.runtime_minutes,
             p.loop_title_id, p.authorization_status,
             l.status as loop_status, l.listed, l.published, l.playback_path
      from bridge_titles b
      left join bridge_loop_publications p on p.bridge_title_id = b.id
      left join loop_titles l on l.id = p.loop_title_id
      order by b.updated_at desc
      limit 200
    `;
    return { titles: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      bridgeStatus: r.status,
      language: r.language,
      hasMaster: Boolean(r.master_key),
      ready: ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(r.status) && Boolean(r.master_key),
      blockers: [
        ...(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(r.status) ? [] : ["Rights/licensing lifecycle is not publication-ready"]),
        ...(r.master_key ? [] : ["Master asset is missing"]),
      ],
      publication: r.loop_title_id ? {
        loopTitleId: r.loop_title_id,
        authorizationStatus: r.authorization_status,
        loopStatus: r.loop_status,
        listed: Boolean(r.listed),
        published: Boolean(r.published),
        playbackPath: r.playback_path,
      } : null,
    })) };
  });

export const authorizeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(publishInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "loop.publish");
    if (data.windowStart && data.windowEnd && new Date(data.windowEnd) <= new Date(data.windowStart)) {
      throw new Error("Window end must be after window start");
    }
    const sql = await getSql();
    const titles = await sql<{
      id: string; slug: string; name: string; status: string; synopsis: string; language: string;
      year: number | null; runtime_minutes: number | null; poster_key: string | null; master_key: string | null;
    }>`select id, slug, name, status, synopsis, language, year, runtime_minutes, poster_key, master_key from bridge_titles where id = ${data.bridgeTitleId} limit 1`;
    const title = titles[0];
    if (!title) throw new Error("Bridge title not found");
    if (!["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status)) {
      throw new Error("Title has not passed rights/licensing readiness");
    }
    if (!title.master_key) throw new Error("Master asset is required before Loop publication");

    const existing = await sql<{ id: string }>`select id from loop_titles where bridge_title_id = ${title.id} limit 1`;
    const loopTitleId = existing[0]?.id ?? randomUUID();
    await sql`
      insert into loop_titles (
        id, bridge_title_id, slug, title, synopsis, content_type, language, year,
        duration_minutes, poster_path, playback_path, metadata, status, listed,
        published, featured, access_tier, updated_at
      ) values (
        ${loopTitleId}, ${title.id}, ${title.slug}, ${title.name}, ${title.synopsis}, ${"movie"},
        ${title.language}, ${title.year}, ${title.runtime_minutes}, ${title.poster_key}, ${title.master_key},
        ${JSON.stringify({ source: "bridge-command-center" })}::jsonb, ${"approved"}, true, true, false,
        ${data.accessTier}, now()
      )
      on conflict (bridge_title_id) do update set
        slug = excluded.slug, title = excluded.title, synopsis = excluded.synopsis,
        language = excluded.language, year = excluded.year, duration_minutes = excluded.duration_minutes,
        poster_path = excluded.poster_path, playback_path = excluded.playback_path,
        status = 'approved', listed = true, published = true, access_tier = excluded.access_tier,
        updated_at = now()
    `;
    await sql`
      insert into bridge_loop_publications (
        id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
        exploitation_models, window_start, window_end, approved_by, approved_at, metadata, updated_at
      ) values (
        ${randomUUID()}, ${title.id}, ${loopTitleId}, ${"authorized"}, ${data.territories}, ${data.languages},
        ${data.exploitationModels}, ${data.windowStart ?? null}, ${data.windowEnd ?? null},
        ${actor.userId}, now(), ${JSON.stringify({ source: "bridge-command-center" })}::jsonb, now()
      )
      on conflict (bridge_title_id) do update set
        loop_title_id = excluded.loop_title_id, authorization_status = 'authorized',
        territories = excluded.territories, languages = excluded.languages,
        exploitation_models = excluded.exploitation_models, window_start = excluded.window_start,
        window_end = excluded.window_end, approved_by = excluded.approved_by, approved_at = now(),
        revoked_at = null, metadata = excluded.metadata, updated_at = now()
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "loop.publish",
      entityType: "bridge_title",
      entityId: title.id,
      metadata: { loopTitleId, territories: data.territories, languages: data.languages, exploitationModels: data.exploitationModels, accessTier: data.accessTier },
    });
    return { ok: true, loopTitleId, status: "PUBLISHED" as const };
  });

export const revokeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "loop.revoke");
    const sql = await getSql();
    const pubs = await sql<{ loop_title_id: string }>`select loop_title_id from bridge_loop_publications where bridge_title_id = ${data.bridgeTitleId} limit 1`;
    if (!pubs[0]) throw new Error("Publication not found");
    await sql`update bridge_loop_publications set authorization_status = 'revoked', revoked_at = now(), updated_at = now() where bridge_title_id = ${data.bridgeTitleId}`;
    await sql`update loop_titles set status = 'revoked', listed = false, published = false, updated_at = now() where id = ${pubs[0].loop_title_id}`;
    await writeAudit({ actorUserId: actor.userId, action: "loop.revoke", entityType: "bridge_title", entityId: data.bridgeTitleId });
    return { ok: true, status: "REVOKED" as const };
  });

export const getLoopPublication = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    const rows = await sql<PublicationRow>`
      select p.*, l.status as loop_status, l.listed, l.published, l.playback_path
      from bridge_loop_publications p join loop_titles l on l.id = p.loop_title_id
      where p.bridge_title_id = ${data.bridgeTitleId} limit 1
    `;
    const r = rows[0];
    if (!r) return { publication: null };
    return { publication: {
      bridgeTitleId: r.bridge_title_id, loopTitleId: r.loop_title_id,
      authorizationStatus: r.authorization_status, territories: r.territories,
      languages: r.languages, exploitationModels: r.exploitation_models,
      windowStart: iso(r.window_start), windowEnd: iso(r.window_end), approvedAt: iso(r.approved_at),
      revokedAt: iso(r.revoked_at), loopStatus: r.loop_status, listed: r.listed,
      published: r.published, playbackPath: r.playback_path,
    } };
  });
