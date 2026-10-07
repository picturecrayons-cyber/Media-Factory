import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireActor } from "./session";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";
import { assertPublicationCanExtend, findCoveringRightsGrant, type BridgeRightsGrant } from "./rights-coverage";

export type DistributionAuthorizationStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "AUTHORIZED"
  | "PREPARING"
  | "DELIVERED"
  | "LIVE"
  | "SUSPENDED"
  | "EXPIRED"
  | "REVOKED"
  | "FAILED";

export type ExploitationModel = "SVOD" | "TVOD" | "AVOD" | "FREE" | "PROMOTIONAL";

export type CommercialTermsSummary = {
  rightsOwnerSharePct?: number;
  distributorSharePct?: number;
  feePaise?: number;
  notes?: string;
};

export type PublicationRow = {
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
  metadata: Record<string, unknown> | null;
  loop_status: string;
  listed: boolean;
  published: boolean;
  playback_path: string | null;
};

const publishInput = z.object({
  bridgeTitleId: z.string().min(1),
  destination: z.literal("CRAYONS_LOOP").default("CRAYONS_LOOP"),
  territories: z.array(z.string().min(2).max(32)).min(1).max(50),
  languages: z.array(z.string().min(2).max(40)).min(1).max(20),
  exploitationModels: z.array(z.enum(["SVOD", "TVOD", "AVOD", "FREE", "PROMOTIONAL"])).min(1).max(5),
  windowStart: z.string().datetime().nullable().optional(),
  windowEnd: z.string().datetime().nullable().optional(),
  accessTier: z.enum(["FREE", "SVOD", "TVOD"]),
  commercialTerms: z
    .object({
      rightsOwnerSharePct: z.number().min(0).max(100).optional(),
      distributorSharePct: z.number().min(0).max(100).optional(),
      feePaise: z.number().nonnegative().optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
});

function iso(v: string | Date | null) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** Pre-flight verification checking rights, assets, QC and operator authority */
export async function verifyDistributionPreflight(
  sql: any,
  titleId: string,
  rightsRequest?: {
    destination: "CRAYONS_LOOP";
    territories: string[];
    languages: string[];
    exploitationModels: string[];
    windowStart?: string | null;
    windowEnd?: string | null;
  }
) {
  const titles = await sql<{
    id: string;
    slug: string;
    name: string;
    status: string;
    language: string;
    master_key: string | null;
    poster_key: string | null;
    synopsis: string;
    year: number | null;
    runtime_minutes: number | null;
  }>`
    select id, slug, name, status, language, master_key, poster_key, synopsis, year, runtime_minutes
    from bridge_titles
    where id = ${titleId}
    limit 1
  `;
  const title = titles[0];
  if (!title) {
    return { eligible: false, reasons: ["Title record does not exist in Crayons Bridge."] };
  }

  const reasons: string[] = [];

  // 1. QC & Master verification
  if (!title.master_key) {
    reasons.push("Technical QC master video asset is missing.");
  }

  // 2. Rights readiness verification
  const validRightsStatuses = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"];
  if (!validRightsStatuses.includes(title.status)) {
    reasons.push(
      `Underlying rights clearance and lifecycle status (${title.status}) is not distribution-ready. Must reach at least LICENSING_READY.`
    );
  }

  let rightsGrantId: string | null = null;
  if (!rightsRequest) reasons.push("Publication rights dimensions are required for distribution preflight.");
  if (rightsRequest) {
    const grants = await sql<BridgeRightsGrant>`
      select id, status, territories, languages, media, window_start, window_end, exclusivity
      from bridge_rights_grants
      where title_id = ${titleId}
        and status = 'VALID'
      order by created_at desc
    `;

    const coveringGrant = findCoveringRightsGrant(grants, rightsRequest);
    rightsGrantId = coveringGrant?.id ?? null;
    if (!coveringGrant) {
      reasons.push(
        "No active Bridge rights grant covers the requested Loop destination, territory, language, exploitation model, and window."
      );
    }
  }

  // 3. Required presentation assets
  if (!title.poster_key) {
    reasons.push("Consumer catalog poster asset is required for destination display.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    title,
    rightsGrantId,
  };
}

export const listLoopPublicationReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();

    // Auto-reevaluate any expired distribution windows
    await sql`
      update bridge_loop_publications
      set authorization_status = 'expired', updated_at = now()
      where window_end is not null and window_end < now() and authorization_status in ('authorized', 'live')
    `.catch(() => {});

    await sql`
      update loop_titles
      set status = 'expired', published = false, listed = false, updated_at = now()
      where bridge_title_id in (
        select bridge_title_id from bridge_loop_publications where authorization_status = 'expired'
      ) and published = true
    `.catch(() => {});

    const rows = await sql<{
      id: string;
      slug: string;
      name: string;
      status: string;
      language: string;
      master_key: string | null;
      poster_key: string | null;
      synopsis: string;
      year: number | null;
      runtime_minutes: number | null;
      loop_title_id: string | null;
      authorization_status: string | null;
      window_start: string | Date | null;
      window_end: string | Date | null;
      territories: string[] | null;
      languages: string[] | null;
      exploitation_models: string[] | null;
      loop_status: string | null;
      listed: boolean | null;
      published: boolean | null;
      playback_path: string | null;
    }>`
      select b.id, b.slug, b.name, b.status, b.language, b.master_key, b.poster_key,
             b.synopsis, b.year, b.runtime_minutes,
             p.loop_title_id, p.authorization_status, p.window_start, p.window_end,
             p.territories, p.languages, p.exploitation_models,
             l.status as loop_status, l.listed, l.published, l.playback_path
      from bridge_titles b
      left join bridge_loop_publications p on p.bridge_title_id = b.id
      left join loop_titles l on l.id = p.loop_title_id
      order by b.updated_at desc
      limit 200
    `;

    const grants = await sql<BridgeRightsGrant & { title_id: string }>`
      select id, title_id, status, territories, languages, media, window_start, window_end, exclusivity
      from bridge_rights_grants where status = 'VALID'
    `;

    return {
      titles: rows.map((r) => {
        const coveringGrant = r.loop_title_id ? findCoveringRightsGrant(
          grants.filter((grant) => grant.title_id === r.id),
          {
            destination: "CRAYONS_LOOP",
            territories: r.territories || [],
            languages: r.languages || [],
            exploitationModels: r.exploitation_models || [],
            windowStart: iso(r.window_start),
            windowEnd: iso(r.window_end),
          }
        ) : null;
        const isReady =
          Boolean(coveringGrant) &&
          ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(r.status) &&
          Boolean(r.master_key) &&
          Boolean(r.poster_key);

        const blockers: string[] = [];
        if (!coveringGrant) blockers.push("A matching rights grant and explicit publication dimensions are required");
        if (!["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(r.status)) {
          blockers.push(`Rights status (${r.status}) is not cleared for distribution`);
        }
        if (!r.master_key) blockers.push("QC master video is missing");
        if (!r.poster_key) blockers.push("Artwork/poster is missing");

        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          bridgeStatus: r.status,
          language: r.language,
          hasMaster: Boolean(r.master_key),
          hasPoster: Boolean(r.poster_key),
          ready: isReady,
          blockers,
          publication: r.loop_title_id
            ? {
                destination: "CRAYONS_LOOP" as const,
                loopTitleId: r.loop_title_id,
                authorizationStatus: (r.authorization_status?.toUpperCase() || "PENDING") as DistributionAuthorizationStatus,
                territories: r.territories || ["IN"],
                languages: r.languages || [r.language],
                exploitationModels: r.exploitation_models || ["SVOD"],
                windowStart: iso(r.window_start),
                windowEnd: iso(r.window_end),
                loopStatus: r.loop_status,
                listed: Boolean(r.listed),
                published: Boolean(r.published),
                playbackPath: r.playback_path,
              }
            : null,
        };
      }),
    };
  });

export const authorizeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(publishInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "loop.publish");

    if (data.windowStart && data.windowEnd && new Date(data.windowEnd) <= new Date(data.windowStart)) {
      throw new Error("Distribution window end date must be strictly after window start date.");
    }

    if (!data.exploitationModels.includes(data.accessTier)) {
      throw new Error("Consumer access tier must be covered by the requested exploitation models.");
    }
    const sql = await getSql();
    await assertDuplicateTitleLoopReleaseAllowed(sql, data.bridgeTitleId);
    await assertBuyerPublishable(data.bridgeTitleId);
    const preflight = await verifyDistributionPreflight(sql, data.bridgeTitleId, {
      destination: data.destination,
      territories: data.territories,
      languages: data.languages,
      exploitationModels: data.exploitationModels,
      windowStart: data.windowStart,
      windowEnd: data.windowEnd,
    });
    if (!preflight.eligible || !preflight.title) {
      throw new Error(`Distribution Authorization Blocked: ${preflight.reasons.join(" · ")}`);
    }

    const title = preflight.title;
    const existing = await sql<{ id: string }>`select id from loop_titles where bridge_title_id = ${title.id} limit 1`;
    const loopTitleId = existing[0]?.id ?? randomUUID();

    // 1. Synchronize master publication record in Crayons Loop
    await sql`
      insert into loop_titles (
        id, bridge_title_id, slug, title, synopsis, content_type, language, year,
        duration_minutes, poster_path, playback_path, metadata, status, listed,
        published, featured, access_tier, updated_at
      ) values (
        ${loopTitleId}, ${title.id}, ${title.slug}, ${title.name}, ${title.synopsis}, ${"movie"},
        ${title.language}, ${title.year}, ${title.runtime_minutes}, ${title.poster_key}, ${title.master_key},
        ${JSON.stringify({
          source: "crayons-bridge-master-distribution",
          rightsGrantId: preflight.rightsGrantId,
          authorizedBy: actor.userId,
          commercialTerms: data.commercialTerms || null,
        })}::jsonb,
        ${"approved"}, true, true, false,
        ${data.accessTier}, now()
      )
      on conflict (bridge_title_id) do update set
        slug = excluded.slug, title = excluded.title, synopsis = excluded.synopsis,
        language = excluded.language, year = excluded.year, duration_minutes = excluded.duration_minutes,
        poster_path = excluded.poster_path, playback_path = excluded.playback_path,
        status = 'approved', listed = true, published = true, access_tier = excluded.access_tier,
        metadata = excluded.metadata, updated_at = now()
    `;

    // 2. Authorize distribution record in Bridge control plane
    await sql`
      insert into bridge_loop_publications (
        id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
        exploitation_models, window_start, window_end, approved_by, approved_at, metadata, updated_at
      ) values (
        ${randomUUID()}, ${title.id}, ${loopTitleId}, ${"authorized"}, ${data.territories}, ${data.languages},
        ${data.exploitationModels}, ${data.windowStart ?? null}, ${data.windowEnd ?? null},
        ${actor.userId}, now(),
        ${JSON.stringify({
          destination: "CRAYONS_LOOP",
          commercialTerms: data.commercialTerms || null,
          authorizedOperator: actor.userId,
          rightsGrantId: preflight.rightsGrantId,
        })}::jsonb,
        now()
      )
      on conflict (bridge_title_id) do update set
        loop_title_id = excluded.loop_title_id, authorization_status = 'authorized',
        territories = excluded.territories, languages = excluded.languages,
        exploitation_models = excluded.exploitation_models, window_start = excluded.window_start,
        window_end = excluded.window_end, approved_by = excluded.approved_by, approved_at = now(),
        revoked_at = null, metadata = excluded.metadata, updated_at = now()
    `;

    // 3. Write immutable audit log
    await writeAudit({
      actorUserId: actor.userId,
      action: "distribution.authorize_loop",
      entityType: "bridge_title",
      entityId: title.id,
      metadata: {
        destination: "CRAYONS_LOOP",
        loopTitleId,
        rightsGrantId: preflight.rightsGrantId,
        territories: data.territories,
        languages: data.languages,
        exploitationModels: data.exploitationModels,
        windowStart: data.windowStart,
        windowEnd: data.windowEnd,
        commercialTerms: data.commercialTerms,
      },
    });

    return { ok: true, loopTitleId, status: "AUTHORIZED" as const };
  });

export const suspendLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1), reason: z.string().optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "loop.revoke");
    const sql = await getSql();

    const pubs = await sql<{ loop_title_id: string }>`
      select loop_title_id from bridge_loop_publications where bridge_title_id = ${data.bridgeTitleId} limit 1
    `;
    if (!pubs[0]) throw new Error("Distribution record not found");

    await sql`
      update bridge_loop_publications
      set authorization_status = 'suspended', updated_at = now()
      where bridge_title_id = ${data.bridgeTitleId}
    `;

    await sql`
      update loop_titles
      set status = 'suspended', listed = false, published = false, updated_at = now()
      where id = ${pubs[0].loop_title_id}
    `;

    await writeAudit({
      actorUserId: actor.userId,
      action: "distribution.suspend_loop",
      entityType: "bridge_title",
      entityId: data.bridgeTitleId,
      metadata: { reason: data.reason || "Operational suspension" },
    });

    return { ok: true, status: "SUSPENDED" as const };
  });

export const revokeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "loop.revoke");
    const sql = await getSql();

    const pubs = await sql<{ loop_title_id: string }>`
      select loop_title_id from bridge_loop_publications where bridge_title_id = ${data.bridgeTitleId} limit 1
    `;
    if (!pubs[0]) throw new Error("Distribution record not found");

    await sql`
      update bridge_loop_publications
      set authorization_status = 'revoked', revoked_at = now(), updated_at = now()
      where bridge_title_id = ${data.bridgeTitleId}
    `;

    await sql`
      update loop_titles
      set status = 'revoked', listed = false, published = false, updated_at = now()
      where id = ${pubs[0].loop_title_id}
    `;

    await writeAudit({
      actorUserId: actor.userId,
      action: "distribution.revoke_loop",
      entityType: "bridge_title",
      entityId: data.bridgeTitleId,
    });

    return { ok: true, status: "REVOKED" as const };
  });

export const extendDistributionWindow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bridgeTitleId: z.string().min(1),
      newWindowEnd: z.string().datetime(),
    })
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "loop.publish");
    const sql = await getSql();

    const pubs = await sql<{
      loop_title_id: string;
      window_start: string | Date | null;
      authorization_status: string;
      revoked_at: string | Date | null;
      territories: string[];
      languages: string[];
      exploitation_models: string[];
    }>`
      select loop_title_id, window_start, authorization_status, revoked_at,
             territories, languages, exploitation_models
      from bridge_loop_publications where bridge_title_id = ${data.bridgeTitleId} limit 1
    `;
    const publication = pubs[0];
    if (!publication) throw new Error("Distribution record not found");
    assertPublicationCanExtend(publication.authorization_status, publication.revoked_at);

    const preflight = await verifyDistributionPreflight(sql, data.bridgeTitleId, {
      destination: "CRAYONS_LOOP",
      territories: publication.territories,
      languages: publication.languages,
      exploitationModels: publication.exploitation_models,
      windowStart: iso(publication.window_start),
      windowEnd: data.newWindowEnd,
    });
    if (!preflight.eligible) {
      throw new Error(`Distribution Extension Blocked: ${preflight.reasons.join(" · ")}`);
    }

    // Extending a window never restores revoked/suspended visibility or status.
    const updated = await sql<{ id: string }>`
      update bridge_loop_publications
      set window_end = ${data.newWindowEnd},
          metadata = metadata || ${JSON.stringify({ rightsGrantId: preflight.rightsGrantId })}::jsonb,
          updated_at = now()
      where bridge_title_id = ${data.bridgeTitleId}
        and authorization_status in ('authorized', 'live')
        and revoked_at is null
      returning id
    `;
    if (!updated[0]) throw new Error("Publication is no longer active; refresh before extending.");

    await writeAudit({
      actorUserId: actor.userId,
      action: "distribution.extend_window",
      entityType: "bridge_title",
      entityId: data.bridgeTitleId,
      metadata: { newWindowEnd: data.newWindowEnd, rightsGrantId: preflight.rightsGrantId },
    });

    return { ok: true, status: "EXTENDED" as const };
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
      from bridge_loop_publications p
      join loop_titles l on l.id = p.loop_title_id
      where p.bridge_title_id = ${data.bridgeTitleId}
      limit 1
    `;
    const r = rows[0];
    if (!r) return { publication: null };

    return {
      publication: {
        destination: "CRAYONS_LOOP" as const,
        bridgeTitleId: r.bridge_title_id,
        loopTitleId: r.loop_title_id,
        authorizationStatus: r.authorization_status,
        territories: r.territories,
        languages: r.languages,
        exploitationModels: r.exploitation_models,
        windowStart: iso(r.window_start),
        windowEnd: iso(r.window_end),
        approvedAt: iso(r.approved_at),
        revokedAt: iso(r.revoked_at),
        commercialTerms: (r.metadata?.commercialTerms as CommercialTermsSummary) || null,
        loopStatus: r.loop_status,
        listed: r.listed,
        published: r.published,
        playbackPath: r.playback_path,
      },
    };
  });
