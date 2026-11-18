import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { loopStageType } from "@/lib/bridge/loop-lanes";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
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
  exploitationModels: z
    .array(z.enum(["SVOD", "TVOD", "AVOD", "FREE", "PROMOTIONAL"]))
    .min(1)
    .max(5),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
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
  sql: Sql,
  titleId: string,
  rightsRequest?: {
    destination: "CRAYONS_LOOP";
    territories: string[];
    languages: string[];
    exploitationModels: string[];
    windowStart?: string | null;
    windowEnd?: string | null;
  },
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
    content_type: string | null;
  }>`
    select id, slug, name, status, language, master_key, poster_key, synopsis, year, runtime_minutes, content_type
    from bridge_titles
    where id = ${titleId}
    limit 1
  `;
  const title = titles[0];
  if (!title) {
    return { eligible: false, reasons: ["Title record does not exist in Crayons Bridge."] };
  }

  const reasons: string[] = [];
  if (!rightsRequest || !rightsRequest.windowStart || !rightsRequest.windowEnd ||
      rightsRequest.territories.length!==1 || rightsRequest.territories[0]!=="WORLDWIDE" ||
      rightsRequest.exploitationModels.length!==1 || rightsRequest.exploitationModels[0]!=="TVOD")
    reasons.push("Loop requires WORLDWIDE TVOD with explicit start and end dates.");


  // 1. QC & Master verification
  if (!title.master_key) {
    reasons.push("Technical QC master video asset is missing.");
  }

  // 2. Rights readiness verification
  const validRightsStatuses = [
    "LICENSING_READY",
    "LIVE_FOR_BUYERS",
    "IN_NEGOTIATION",
    "LICENSED",
    "DELIVERED",
  ];
  if (!validRightsStatuses.includes(title.status)) {
    reasons.push(
      `Underlying rights clearance and lifecycle status (${title.status}) is not distribution-ready. Must reach at least LICENSING_READY.`,
    );
  }

  let rightsGrantId: string | null = null;
  if (!rightsRequest)
    reasons.push("Publication rights dimensions are required for distribution preflight.");
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
        "No active Bridge rights grant covers the requested Loop destination, territory, language, exploitation model, and window.",
      );
    }
  }

  const reviews = await sql<{
    qc_ok: boolean;
    legal_ok: boolean;
    qc_case_id: string | null;
    legal_case_id: string | null;
  }>`
    select
      exists(select 1 from bridge_qc_cases q where q.title_id=${titleId} and q.status='PASSED'
        and q.reviewer_findings->0->>'masterKey'=${title.master_key}
        and q.reviewer_findings->0->>'posterKey'=${title.poster_key}) as qc_ok,
      exists(select 1 from bridge_legal_cases l where l.title_id=${titleId} and l.status='APPROVED'
        and l.evidence->0->>'grantId'=${rightsGrantId}) as legal_ok,
      (select q.id from bridge_qc_cases q where q.title_id=${titleId} and q.status='PASSED'
        and q.reviewer_findings->0->>'masterKey'=${title.master_key}
        and q.reviewer_findings->0->>'posterKey'=${title.poster_key}
        order by q.reviewed_at desc nulls last, q.created_at desc limit 1) as qc_case_id,
      (select l.id from bridge_legal_cases l where l.title_id=${titleId} and l.status='APPROVED'
        and l.evidence->0->>'grantId'=${rightsGrantId}
        order by l.reviewed_at desc nulls last, l.created_at desc limit 1) as legal_case_id
  `;
  if (!reviews[0]?.qc_ok) reasons.push("Recorded QC approval for the current assets is required.");
  if (!reviews[0]?.legal_ok) reasons.push("Recorded legal approval for this license is required.");

  // Publication is blocked until every explicit consumer-release certification is recorded.
  const gateRows = await sql<{
    ott_preparation_status: string | null;
    packaging_status: string | null;
    curation_status: string | null;
    delivery_status: string | null;
  }>`
    select ott_preparation_status, packaging_status, curation_status, delivery_status
    from bridge_title_gate_certifications
    where title_id = ${titleId}
    limit 1
  `;
  const gates = gateRows[0];
  if (gates?.ott_preparation_status !== "READY")
    reasons.push("OTT preparation must be certified READY.");
  if (gates?.packaging_status !== "COMPLETE")
    reasons.push("Consumer packaging must be certified COMPLETE.");
  if (gates?.curation_status !== "APPROVED")
    reasons.push("Editorial curation must be APPROVED.");
  if (gates?.delivery_status !== "READY")
    reasons.push("Final delivery must be certified READY.");

  // Loop must receive a destination-approved playback rendition, never the private master.
  const packages = await sql<{
    id: string;
    rights_grant_id: string | null;
    qc_case_id: string | null;
    legal_case_id: string | null;
    asset_version_ids: unknown;
    readiness_state: string;
  }>`
    select id, rights_grant_id, qc_case_id, legal_case_id, asset_version_ids, readiness_state
    from bridge_destination_packages
    where title_id = ${titleId}
      and destination = 'CRAYONS_LOOP'
      and readiness_state in ('READY', 'AUTHORIZED', 'DELIVERED')
    order by package_version desc, created_at desc
    limit 1
  `;
  const destinationPackage = packages[0];
  if (!destinationPackage) {
    reasons.push("A current READY Crayons Loop destination package is required.");
  } else {
    if (destinationPackage.rights_grant_id !== rightsGrantId) {
      reasons.push("The Loop destination package must reference the active rights grant.");
    }
    if (destinationPackage.qc_case_id !== (reviews[0]?.qc_case_id ?? null)) {
      reasons.push("The Loop destination package must reference the QC approval for the current master and artwork.");
    }
    if (destinationPackage.legal_case_id !== (reviews[0]?.legal_case_id ?? null)) {
      reasons.push("The Loop destination package must reference the Legal approval for the active rights grant.");
    }
  }

  const assetVersionIds = Array.isArray(destinationPackage?.asset_version_ids)
    ? destinationPackage.asset_version_ids.filter((value): value is string =>
        typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
      )
    : [];
  const renditionRows = assetVersionIds.length
    ? await sql<{
        id: string;
        s3_key: string;
        checksum_sha256: string | null;
        byte_size: number | string | null;
      }>`
        select id, s3_key, checksum_sha256, byte_size
        from bridge_asset_versions
        where title_id = ${titleId}
          and id = any(${assetVersionIds}::uuid[])
          and asset_group = 'VIDEO'
          and asset_type = 'LOOP_HLS_MASTER'
          and processing_state = 'PASSED'
          and checksum_sha256 ~ '^[a-f0-9]{64}$'
          and byte_size > 0
        order by version desc, created_at desc
        limit 1
      `
    : [];
  const playbackRendition = renditionRows[0] ?? null;
  if (!playbackRendition) {
    reasons.push("The approved destination package must include a checksum-verified LOOP_HLS_MASTER rendition.");
  }

  const licenses = rightsGrantId
    ? await sql<{ evidence: Array<{ commercialTerms?: CommercialTermsSummary }> }>`
        select evidence from bridge_rights_grants where id=${rightsGrantId}
      `
    : [];
  const commercialTerms = licenses[0]?.evidence?.[0]?.commercialTerms;
  if (
    !commercialTerms ||
    !Number.isInteger(commercialTerms.rightsOwnerSharePct) ||
    !Number.isInteger(commercialTerms.distributorSharePct) ||
    (commercialTerms.rightsOwnerSharePct ?? 0) + (commercialTerms.distributorSharePct ?? 0) !== 100
  )
    reasons.push("Approved license revenue shares are required.");

  // 3. Required presentation assets
  if (!title.poster_key) {
    reasons.push("Consumer catalog poster asset is required for destination display.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    title,
    rightsGrantId,
    commercialTerms,
    destinationPackageId: destinationPackage?.id ?? null,
    playbackRendition,
  };
}

export const listLoopPublicationReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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
      qc_approved: boolean;
      legal_grant_ids: string[] | null;
      qc_case_id: string | null;
      destination_package_id: string | null;
      package_rights_grant_id: string | null;
      package_qc_case_id: string | null;
      package_legal_case_id: string | null;
      legal_approvals: Array<{ id: string; grantId: string | null }> | null;
      playback_asset_version_id: string | null;
      playback_rendition_key: string | null;
      playback_checksum_sha256: string | null;
      playback_byte_size: number | string | null;
      ott_preparation_status: string | null;
      packaging_status: string | null;
      curation_status: string | null;
      delivery_status: string | null;
    }>`
      select b.id, b.slug, b.name, b.status, b.language, b.master_key, b.poster_key,
             b.synopsis, b.year, b.runtime_minutes,
             p.loop_title_id, p.authorization_status, p.window_start, p.window_end,
             p.territories, p.languages, p.exploitation_models,
             l.status as loop_status, l.listed, l.published, l.playback_path,
             exists(
               select 1 from bridge_qc_cases q
               where q.title_id=b.id and q.status='PASSED'
                 and q.reviewer_findings->0->>'masterKey'=b.master_key
                 and q.reviewer_findings->0->>'posterKey'=b.poster_key
             ) as qc_approved,
             coalesce((
               select jsonb_agg(lc.evidence->0->>'grantId')
               from bridge_legal_cases lc
               where lc.title_id=b.id and lc.status='APPROVED'
             ), '[]'::jsonb) as legal_grant_ids,
             coalesce((
               select jsonb_agg(jsonb_build_object('id',lc.id,'grantId',lc.evidence->0->>'grantId'))
               from bridge_legal_cases lc
               where lc.title_id=b.id and lc.status='APPROVED'
             ), '[]'::jsonb) as legal_approvals,
             (select q.id from bridge_qc_cases q
               where q.title_id=b.id and q.status='PASSED'
                 and q.reviewer_findings->0->>'masterKey'=b.master_key
                 and q.reviewer_findings->0->>'posterKey'=b.poster_key
               order by q.reviewed_at desc nulls last, q.created_at desc limit 1) as qc_case_id,
             dp.id as destination_package_id,
             dp.rights_grant_id as package_rights_grant_id,
             dp.qc_case_id as package_qc_case_id,
             dp.legal_case_id as package_legal_case_id,
             rendition.id as playback_asset_version_id,
             rendition.s3_key as playback_rendition_key,
             rendition.checksum_sha256 as playback_checksum_sha256,
             rendition.byte_size as playback_byte_size,
             g.ott_preparation_status, g.packaging_status, g.curation_status, g.delivery_status
      from bridge_titles b
      left join bridge_loop_publications p on p.bridge_title_id = b.id
      left join loop_titles l on l.id = p.loop_title_id
      left join bridge_title_gate_certifications g on g.title_id = b.id
      left join lateral (
        select id, rights_grant_id, qc_case_id, asset_version_ids
        from bridge_destination_packages
        where title_id=b.id and destination='CRAYONS_LOOP'
          and readiness_state in ('READY','AUTHORIZED','DELIVERED')
        order by package_version desc, created_at desc
        limit 1
      ) dp on true
      left join lateral (
        select v.id, v.s3_key, v.checksum_sha256, v.byte_size
        from bridge_asset_versions v
        where v.title_id=b.id and v.asset_group='VIDEO'
          and v.asset_type='LOOP_HLS_MASTER' and v.processing_state='PASSED'
          and v.checksum_sha256 ~ '^[a-f0-9]{64}
      order by b.updated_at desc
      limit 200
    `;

    const grants = await sql<BridgeRightsGrant & { title_id: string }>`
      select id, title_id, status, territories, languages, media, window_start, window_end, exclusivity
      from bridge_rights_grants where status = 'VALID'
    `;

    return {
      titles: rows.map((r) => {
        const titleGrants = grants.filter((grant) => grant.title_id === r.id);
        const requestedTerritories = r.territories?.length ? r.territories : ["IN"];
        const requestedLanguages = r.languages?.length ? r.languages : [r.language];
        const requestedModels = r.exploitation_models?.length ? r.exploitation_models : ["TVOD"];
        const now = new Date();
        const coveringGrant = titleGrants.find((grant) => {
          const grantStart = grant.window_start ? new Date(grant.window_start) : null;
          const candidateStart = r.window_start
            ? new Date(r.window_start)
            : grantStart && grantStart > now ? grantStart : now;
          const grantEnd = grant.window_end ? new Date(grant.window_end) : null;
          const candidateEnd = r.window_end
            ? new Date(r.window_end)
            : grantEnd ?? new Date(candidateStart.getTime() + 24 * 60 * 60 * 1000);
          return Boolean(findCoveringRightsGrant([grant], {
            destination: "CRAYONS_LOOP",
            territories: requestedTerritories,
            languages: requestedLanguages,
            exploitationModels: requestedModels,
            windowStart: candidateStart.toISOString(),
            windowEnd: candidateEnd.toISOString(),
          }));
        });
        const legalGrantIds = Array.isArray(r.legal_grant_ids) ? r.legal_grant_ids : [];
        const legalApprovals = Array.isArray(r.legal_approvals) ? r.legal_approvals : [];
        const currentLegalCaseId = legalApprovals.find((approval) => approval.grantId === coveringGrant?.id)?.id ?? null;
        const legalApproved = Boolean(coveringGrant && legalGrantIds.includes(coveringGrant.id) && currentLegalCaseId);
        const gatesReady =
          r.ott_preparation_status === "READY" &&
          r.packaging_status === "COMPLETE" &&
          r.curation_status === "APPROVED" &&
          r.delivery_status === "READY";
        const packageReady =
          Boolean(r.destination_package_id) &&
          r.package_rights_grant_id === (coveringGrant?.id ?? null) &&
          r.package_qc_case_id === r.qc_case_id &&
          r.package_legal_case_id === currentLegalCaseId;
        const playbackReady =
          Boolean(r.playback_asset_version_id) &&
          Boolean(r.playback_rendition_key) &&
          Boolean(r.playback_checksum_sha256) &&
          Number(r.playback_byte_size) > 0;
        const isReady =
          Boolean(coveringGrant) &&
          legalApproved &&
          Boolean(r.qc_approved) &&
          gatesReady &&
          packageReady &&
          playbackReady &&
          [
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status) &&
          Boolean(r.master_key) &&
          Boolean(r.poster_key);

        const blockers: string[] = [];
        if (!coveringGrant)
          blockers.push("A matching rights grant and explicit publication dimensions are required");
        if (!r.qc_approved) blockers.push("QC approval for the current master and artwork is required");
        if (!legalApproved) blockers.push("Legal approval must reference the active rights grant");
        if (r.ott_preparation_status !== "READY") blockers.push("OTT preparation is not certified READY");
        if (r.packaging_status !== "COMPLETE") blockers.push("Consumer packaging is not certified COMPLETE");
        if (r.curation_status !== "APPROVED") blockers.push("Editorial curation is not APPROVED");
        if (r.delivery_status !== "READY") blockers.push("Final delivery is not certified READY");
        if (!r.destination_package_id) blockers.push("A READY Crayons Loop destination package is required");
        else if (!packageReady) blockers.push("The Loop package must reference the active rights grant, current QC approval, and matching Legal approval");
        if (!playbackReady) blockers.push("A checksum-verified LOOP_HLS_MASTER playback rendition is required");
        if (
          ![
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status)
        ) {
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
                authorizationStatus: (r.authorization_status?.toUpperCase() ||
                  "PENDING") as DistributionAuthorizationStatus,
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
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");

    if (new Date(data.windowEnd) <= new Date(data.windowStart)) {
      throw new Error("Distribution window end date must be strictly after window start date.");
    }

    if (!data.exploitationModels.includes(data.accessTier)) {
      throw new Error("Consumer access tier must be covered by the requested exploitation models.");
    }
    return (await getSql()).transaction(async (sql) => {
      await sql`select id from bridge_titles where id=${data.bridgeTitleId} for update`;
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
      const existing = await sql<{
        id: string;
      }>`select id from loop_titles where bridge_title_id = ${title.id} limit 1`;
      const loopTitleId = existing[0]?.id ?? randomUUID();

      // 1. Synchronize master publication record in Crayons Loop
      await sql`
      insert into loop_titles (
        id, bridge_title_id, slug, title, synopsis, content_type, language, year,
        duration_minutes, poster_path, playback_path, metadata, status, listed,
        published, featured, access_tier, updated_at
      ) values (
        ${loopTitleId}, ${title.id}, ${title.slug}, ${title.name}, ${title.synopsis}, ${loopStageType(title.content_type)},
        ${title.language}, ${title.year}, ${title.runtime_minutes}, ${title.poster_key}, ${preflight.playbackRendition?.s3_key ?? null},
        ${JSON.stringify({
          source: "crayons-bridge-master-distribution",
          lane: loopStageType(title.content_type),
          rightsGrantId: preflight.rightsGrantId,
          destinationPackageId: preflight.destinationPackageId,
          playbackAssetVersionId: preflight.playbackRendition?.id ?? null,
          playbackChecksumSha256: preflight.playbackRendition?.checksum_sha256 ?? null,
          playbackByteSize: preflight.playbackRendition?.byte_size ?? null,
          authorizedBy: actor.userId,
          commercialTerms: preflight.commercialTerms || null,
        })}::jsonb,
        ${"approved"}, true, true, false,
        ${data.accessTier}, now()
      )
      on conflict (bridge_title_id) do update set
        slug = excluded.slug, title = excluded.title, synopsis = excluded.synopsis,
        content_type = excluded.content_type,
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
          commercialTerms: preflight.commercialTerms || null,
          authorizedOperator: actor.userId,
          rightsGrantId: preflight.rightsGrantId,
          destinationPackageId: preflight.destinationPackageId,
          playbackAssetVersionId: preflight.playbackRendition?.id ?? null,
          playbackChecksumSha256: preflight.playbackRendition?.checksum_sha256 ?? null,
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
      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.authorize_loop",
          entityType: "bridge_title",
          entityId: title.id,
          metadata: {
            destination: "CRAYONS_LOOP",
            loopTitleId,
            rightsGrantId: preflight.rightsGrantId,
            destinationPackageId: preflight.destinationPackageId,
            playbackAssetVersionId: preflight.playbackRendition?.id ?? null,
            territories: data.territories,
            languages: data.languages,
            exploitationModels: data.exploitationModels,
            windowStart: data.windowStart,
            windowEnd: data.windowEnd,
            commercialTerms: preflight.commercialTerms,
          },
        },
        sql,
      );

      return { ok: true, loopTitleId, status: "AUTHORIZED" as const };
    });
  });

export const suspendLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1), reason: z.string().optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.suspend_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { reason: data.reason || "Operational suspension" },
        },
        sql,
      );

      return { ok: true, status: "SUSPENDED" as const };
    });
  });

export const revokeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.revoke_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
        },
        sql,
      );

      return { ok: true, status: "REVOKED" as const };
    });
  });

export const extendDistributionWindow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bridgeTitleId: z.string().min(1),
      newWindowEnd: z.string().datetime(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    return (await getSql()).transaction(async (sql) => {
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
      if (!updated[0])
        throw new Error("Publication is no longer active; refresh before extending.");

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.extend_window",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { newWindowEnd: data.newWindowEnd, rightsGrantId: preflight.rightsGrantId },
        },
        sql,
      );

      return { ok: true, status: "EXTENDED" as const };
    });
  });

export const getLoopPublication = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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

          and byte_size > 0
        order by version desc, created_at desc
        limit 1
      `
    : [];
  const playbackRendition = renditionRows[0] ?? null;
  if (!playbackRendition) {
    reasons.push("The approved destination package must include a checksum-verified LOOP_HLS_MASTER rendition.");
  }

  const licenses = rightsGrantId
    ? await sql<{ evidence: Array<{ commercialTerms?: CommercialTermsSummary }> }>`
    select evidence from bridge_rights_grants where id=${rightsGrantId}
  `
    : [];
  const commercialTerms = licenses[0]?.evidence?.[0]?.commercialTerms;
  if (
    !commercialTerms ||
    !Number.isInteger(commercialTerms.rightsOwnerSharePct) ||
    !Number.isInteger(commercialTerms.distributorSharePct) ||
    (commercialTerms.rightsOwnerSharePct ?? 0) + (commercialTerms.distributorSharePct ?? 0) !== 100
  )
    reasons.push("Approved license revenue shares are required.");

  // 3. Required presentation assets
  if (!title.poster_key) {
    reasons.push("Consumer catalog poster asset is required for destination display.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    title,
    rightsGrantId,
    commercialTerms,
  };
}

export const listLoopPublicationReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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
      qc_approved: boolean;
      legal_grant_ids: string[] | null;
      ott_preparation_status: string | null;
      packaging_status: string | null;
      curation_status: string | null;
      delivery_status: string | null;
    }>`
      select b.id, b.slug, b.name, b.status, b.language, b.master_key, b.poster_key,
             b.synopsis, b.year, b.runtime_minutes,
             p.loop_title_id, p.authorization_status, p.window_start, p.window_end,
             p.territories, p.languages, p.exploitation_models,
             l.status as loop_status, l.listed, l.published, l.playback_path,
             exists(
               select 1 from bridge_qc_cases q
               where q.title_id=b.id and q.status='PASSED'
                 and q.reviewer_findings->0->>'masterKey'=b.master_key
                 and q.reviewer_findings->0->>'posterKey'=b.poster_key
             ) as qc_approved,
             coalesce((
               select jsonb_agg(lc.evidence->0->>'grantId')
               from bridge_legal_cases lc
               where lc.title_id=b.id and lc.status='APPROVED'
             ), '[]'::jsonb) as legal_grant_ids,
             g.ott_preparation_status, g.packaging_status, g.curation_status, g.delivery_status
      from bridge_titles b
      left join bridge_loop_publications p on p.bridge_title_id = b.id
      left join loop_titles l on l.id = p.loop_title_id
      left join bridge_title_gate_certifications g on g.title_id = b.id
      order by b.updated_at desc
      limit 200
    `;

    const grants = await sql<BridgeRightsGrant & { title_id: string }>`
      select id, title_id, status, territories, languages, media, window_start, window_end, exclusivity
      from bridge_rights_grants where status = 'VALID'
    `;

    return {
      titles: rows.map((r) => {
        const coveringGrant = r.loop_title_id
          ? findCoveringRightsGrant(
              grants.filter((grant) => grant.title_id === r.id),
              {
                destination: "CRAYONS_LOOP",
                territories: r.territories || [],
                languages: r.languages || [],
                exploitationModels: r.exploitation_models || [],
                windowStart: iso(r.window_start),
                windowEnd: iso(r.window_end),
              },
            )
          : null;
        const legalGrantIds = Array.isArray(r.legal_grant_ids) ? r.legal_grant_ids : [];
        const legalApproved = Boolean(coveringGrant && legalGrantIds.includes(coveringGrant.id));
        const gatesReady =
          r.ott_preparation_status === "READY" &&
          r.packaging_status === "COMPLETE" &&
          r.curation_status === "APPROVED" &&
          r.delivery_status === "READY";
        const isReady =
          Boolean(coveringGrant) &&
          legalApproved &&
          Boolean(r.qc_approved) &&
          gatesReady &&
          [
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status) &&
          Boolean(r.master_key) &&
          Boolean(r.poster_key);

        const blockers: string[] = [];
        if (!coveringGrant)
          blockers.push("A matching rights grant and explicit publication dimensions are required");
        if (!r.qc_approved) blockers.push("QC approval for the current master and artwork is required");
        if (!legalApproved) blockers.push("Legal approval must reference the active rights grant");
        if (r.ott_preparation_status !== "READY") blockers.push("OTT preparation is not certified READY");
        if (r.packaging_status !== "COMPLETE") blockers.push("Consumer packaging is not certified COMPLETE");
        if (r.curation_status !== "APPROVED") blockers.push("Editorial curation is not APPROVED");
        if (r.delivery_status !== "READY") blockers.push("Final delivery is not certified READY");
        if (
          ![
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status)
        ) {
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
                authorizationStatus: (r.authorization_status?.toUpperCase() ||
                  "PENDING") as DistributionAuthorizationStatus,
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
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");

    if (
      data.windowStart &&
      data.windowEnd &&
      new Date(data.windowEnd) <= new Date(data.windowStart)
    ) {
      throw new Error("Distribution window end date must be strictly after window start date.");
    }

    if (!data.exploitationModels.includes(data.accessTier)) {
      throw new Error("Consumer access tier must be covered by the requested exploitation models.");
    }
    return (await getSql()).transaction(async (sql) => {
      await sql`select id from bridge_titles where id=${data.bridgeTitleId} for update`;
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
      const existing = await sql<{
        id: string;
      }>`select id from loop_titles where bridge_title_id = ${title.id} limit 1`;
      const loopTitleId = existing[0]?.id ?? randomUUID();

      // 1. Synchronize master publication record in Crayons Loop
      await sql`
      insert into loop_titles (
        id, bridge_title_id, slug, title, synopsis, content_type, language, year,
        duration_minutes, poster_path, playback_path, metadata, status, listed,
        published, featured, access_tier, updated_at
      ) values (
        ${loopTitleId}, ${title.id}, ${title.slug}, ${title.name}, ${title.synopsis}, ${loopStageType(title.content_type)},
        ${title.language}, ${title.year}, ${title.runtime_minutes}, ${title.poster_key}, ${title.master_key},
        ${JSON.stringify({
          source: "crayons-bridge-master-distribution",
          lane: loopStageType(title.content_type),
          rightsGrantId: preflight.rightsGrantId,
          authorizedBy: actor.userId,
          commercialTerms: preflight.commercialTerms || null,
        })}::jsonb,
        ${"approved"}, true, true, false,
        ${data.accessTier}, now()
      )
      on conflict (bridge_title_id) do update set
        slug = excluded.slug, title = excluded.title, synopsis = excluded.synopsis,
        content_type = excluded.content_type,
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
          commercialTerms: preflight.commercialTerms || null,
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
      await writeAudit(
        {
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
            commercialTerms: preflight.commercialTerms,
          },
        },
        sql,
      );

      return { ok: true, loopTitleId, status: "AUTHORIZED" as const };
    });
  });

export const suspendLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1), reason: z.string().optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.suspend_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { reason: data.reason || "Operational suspension" },
        },
        sql,
      );

      return { ok: true, status: "SUSPENDED" as const };
    });
  });

export const revokeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.revoke_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
        },
        sql,
      );

      return { ok: true, status: "REVOKED" as const };
    });
  });

export const extendDistributionWindow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bridgeTitleId: z.string().min(1),
      newWindowEnd: z.string().datetime(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    return (await getSql()).transaction(async (sql) => {
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
      if (!updated[0])
        throw new Error("Publication is no longer active; refresh before extending.");

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.extend_window",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { newWindowEnd: data.newWindowEnd, rightsGrantId: preflight.rightsGrantId },
        },
        sql,
      );

      return { ok: true, status: "EXTENDED" as const };
    });
  });

export const getLoopPublication = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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
 and v.byte_size > 0
          and exists (
            select 1 from jsonb_array_elements_text(coalesce(dp.asset_version_ids, '[]'::jsonb)) ids
            where ids.value=v.id::text
          )
        order by v.version desc, v.created_at desc
        limit 1
      ) rendition on true
      order by b.updated_at desc
      limit 200
    `;

    const grants = await sql<BridgeRightsGrant & { title_id: string }>`
      select id, title_id, status, territories, languages, media, window_start, window_end, exclusivity
      from bridge_rights_grants where status = 'VALID'
    `;

    return {
      titles: rows.map((r) => {
        const coveringGrant = r.loop_title_id
          ? findCoveringRightsGrant(
              grants.filter((grant) => grant.title_id === r.id),
              {
                destination: "CRAYONS_LOOP",
                territories: r.territories || [],
                languages: r.languages || [],
                exploitationModels: r.exploitation_models || [],
                windowStart: iso(r.window_start),
                windowEnd: iso(r.window_end),
              },
            )
          : null;
        const legalGrantIds = Array.isArray(r.legal_grant_ids) ? r.legal_grant_ids : [];
        const legalApproved = Boolean(coveringGrant && legalGrantIds.includes(coveringGrant.id));
        const gatesReady =
          r.ott_preparation_status === "READY" &&
          r.packaging_status === "COMPLETE" &&
          r.curation_status === "APPROVED" &&
          r.delivery_status === "READY";
        const isReady =
          Boolean(coveringGrant) &&
          legalApproved &&
          Boolean(r.qc_approved) &&
          gatesReady &&
          [
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status) &&
          Boolean(r.master_key) &&
          Boolean(r.poster_key);

        const blockers: string[] = [];
        if (!coveringGrant)
          blockers.push("A matching rights grant and explicit publication dimensions are required");
        if (!r.qc_approved) blockers.push("QC approval for the current master and artwork is required");
        if (!legalApproved) blockers.push("Legal approval must reference the active rights grant");
        if (r.ott_preparation_status !== "READY") blockers.push("OTT preparation is not certified READY");
        if (r.packaging_status !== "COMPLETE") blockers.push("Consumer packaging is not certified COMPLETE");
        if (r.curation_status !== "APPROVED") blockers.push("Editorial curation is not APPROVED");
        if (r.delivery_status !== "READY") blockers.push("Final delivery is not certified READY");
        if (
          ![
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status)
        ) {
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
                authorizationStatus: (r.authorization_status?.toUpperCase() ||
                  "PENDING") as DistributionAuthorizationStatus,
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
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");

    if (new Date(data.windowEnd) <= new Date(data.windowStart)) {
      throw new Error("Distribution window end date must be strictly after window start date.");
    }

    if (!data.exploitationModels.includes(data.accessTier)) {
      throw new Error("Consumer access tier must be covered by the requested exploitation models.");
    }
    return (await getSql()).transaction(async (sql) => {
      await sql`select id from bridge_titles where id=${data.bridgeTitleId} for update`;
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
      const existing = await sql<{
        id: string;
      }>`select id from loop_titles where bridge_title_id = ${title.id} limit 1`;
      const loopTitleId = existing[0]?.id ?? randomUUID();

      // 1. Synchronize master publication record in Crayons Loop
      await sql`
      insert into loop_titles (
        id, bridge_title_id, slug, title, synopsis, content_type, language, year,
        duration_minutes, poster_path, playback_path, metadata, status, listed,
        published, featured, access_tier, updated_at
      ) values (
        ${loopTitleId}, ${title.id}, ${title.slug}, ${title.name}, ${title.synopsis}, ${loopStageType(title.content_type)},
        ${title.language}, ${title.year}, ${title.runtime_minutes}, ${title.poster_key}, ${preflight.playbackRendition?.s3_key ?? null},
        ${JSON.stringify({
          source: "crayons-bridge-master-distribution",
          lane: loopStageType(title.content_type),
          rightsGrantId: preflight.rightsGrantId,
          destinationPackageId: preflight.destinationPackageId,
          playbackAssetVersionId: preflight.playbackRendition?.id ?? null,
          playbackChecksumSha256: preflight.playbackRendition?.checksum_sha256 ?? null,
          playbackByteSize: preflight.playbackRendition?.byte_size ?? null,
          authorizedBy: actor.userId,
          commercialTerms: preflight.commercialTerms || null,
        })}::jsonb,
        ${"approved"}, true, true, false,
        ${data.accessTier}, now()
      )
      on conflict (bridge_title_id) do update set
        slug = excluded.slug, title = excluded.title, synopsis = excluded.synopsis,
        content_type = excluded.content_type,
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
          commercialTerms: preflight.commercialTerms || null,
          authorizedOperator: actor.userId,
          rightsGrantId: preflight.rightsGrantId,
          destinationPackageId: preflight.destinationPackageId,
          playbackAssetVersionId: preflight.playbackRendition?.id ?? null,
          playbackChecksumSha256: preflight.playbackRendition?.checksum_sha256 ?? null,
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
      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.authorize_loop",
          entityType: "bridge_title",
          entityId: title.id,
          metadata: {
            destination: "CRAYONS_LOOP",
            loopTitleId,
            rightsGrantId: preflight.rightsGrantId,
            destinationPackageId: preflight.destinationPackageId,
            playbackAssetVersionId: preflight.playbackRendition?.id ?? null,
            territories: data.territories,
            languages: data.languages,
            exploitationModels: data.exploitationModels,
            windowStart: data.windowStart,
            windowEnd: data.windowEnd,
            commercialTerms: preflight.commercialTerms,
          },
        },
        sql,
      );

      return { ok: true, loopTitleId, status: "AUTHORIZED" as const };
    });
  });

export const suspendLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1), reason: z.string().optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.suspend_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { reason: data.reason || "Operational suspension" },
        },
        sql,
      );

      return { ok: true, status: "SUSPENDED" as const };
    });
  });

export const revokeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.revoke_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
        },
        sql,
      );

      return { ok: true, status: "REVOKED" as const };
    });
  });

export const extendDistributionWindow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bridgeTitleId: z.string().min(1),
      newWindowEnd: z.string().datetime(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    return (await getSql()).transaction(async (sql) => {
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
      if (!updated[0])
        throw new Error("Publication is no longer active; refresh before extending.");

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.extend_window",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { newWindowEnd: data.newWindowEnd, rightsGrantId: preflight.rightsGrantId },
        },
        sql,
      );

      return { ok: true, status: "EXTENDED" as const };
    });
  });

export const getLoopPublication = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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

          and byte_size > 0
        order by version desc, created_at desc
        limit 1
      `
    : [];
  const playbackRendition = renditionRows[0] ?? null;
  if (!playbackRendition) {
    reasons.push("The approved destination package must include a checksum-verified LOOP_HLS_MASTER rendition.");
  }

  const licenses = rightsGrantId
    ? await sql<{ evidence: Array<{ commercialTerms?: CommercialTermsSummary }> }>`
    select evidence from bridge_rights_grants where id=${rightsGrantId}
  `
    : [];
  const commercialTerms = licenses[0]?.evidence?.[0]?.commercialTerms;
  if (
    !commercialTerms ||
    !Number.isInteger(commercialTerms.rightsOwnerSharePct) ||
    !Number.isInteger(commercialTerms.distributorSharePct) ||
    (commercialTerms.rightsOwnerSharePct ?? 0) + (commercialTerms.distributorSharePct ?? 0) !== 100
  )
    reasons.push("Approved license revenue shares are required.");

  // 3. Required presentation assets
  if (!title.poster_key) {
    reasons.push("Consumer catalog poster asset is required for destination display.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    title,
    rightsGrantId,
    commercialTerms,
  };
}

export const listLoopPublicationReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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
      qc_approved: boolean;
      legal_grant_ids: string[] | null;
      ott_preparation_status: string | null;
      packaging_status: string | null;
      curation_status: string | null;
      delivery_status: string | null;
    }>`
      select b.id, b.slug, b.name, b.status, b.language, b.master_key, b.poster_key,
             b.synopsis, b.year, b.runtime_minutes,
             p.loop_title_id, p.authorization_status, p.window_start, p.window_end,
             p.territories, p.languages, p.exploitation_models,
             l.status as loop_status, l.listed, l.published, l.playback_path,
             exists(
               select 1 from bridge_qc_cases q
               where q.title_id=b.id and q.status='PASSED'
                 and q.reviewer_findings->0->>'masterKey'=b.master_key
                 and q.reviewer_findings->0->>'posterKey'=b.poster_key
             ) as qc_approved,
             coalesce((
               select jsonb_agg(lc.evidence->0->>'grantId')
               from bridge_legal_cases lc
               where lc.title_id=b.id and lc.status='APPROVED'
             ), '[]'::jsonb) as legal_grant_ids,
             g.ott_preparation_status, g.packaging_status, g.curation_status, g.delivery_status
      from bridge_titles b
      left join bridge_loop_publications p on p.bridge_title_id = b.id
      left join loop_titles l on l.id = p.loop_title_id
      left join bridge_title_gate_certifications g on g.title_id = b.id
      order by b.updated_at desc
      limit 200
    `;

    const grants = await sql<BridgeRightsGrant & { title_id: string }>`
      select id, title_id, status, territories, languages, media, window_start, window_end, exclusivity
      from bridge_rights_grants where status = 'VALID'
    `;

    return {
      titles: rows.map((r) => {
        const coveringGrant = r.loop_title_id
          ? findCoveringRightsGrant(
              grants.filter((grant) => grant.title_id === r.id),
              {
                destination: "CRAYONS_LOOP",
                territories: r.territories || [],
                languages: r.languages || [],
                exploitationModels: r.exploitation_models || [],
                windowStart: iso(r.window_start),
                windowEnd: iso(r.window_end),
              },
            )
          : null;
        const legalGrantIds = Array.isArray(r.legal_grant_ids) ? r.legal_grant_ids : [];
        const legalApproved = Boolean(coveringGrant && legalGrantIds.includes(coveringGrant.id));
        const gatesReady =
          r.ott_preparation_status === "READY" &&
          r.packaging_status === "COMPLETE" &&
          r.curation_status === "APPROVED" &&
          r.delivery_status === "READY";
        const isReady =
          Boolean(coveringGrant) &&
          legalApproved &&
          Boolean(r.qc_approved) &&
          gatesReady &&
          [
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status) &&
          Boolean(r.master_key) &&
          Boolean(r.poster_key);

        const blockers: string[] = [];
        if (!coveringGrant)
          blockers.push("A matching rights grant and explicit publication dimensions are required");
        if (!r.qc_approved) blockers.push("QC approval for the current master and artwork is required");
        if (!legalApproved) blockers.push("Legal approval must reference the active rights grant");
        if (r.ott_preparation_status !== "READY") blockers.push("OTT preparation is not certified READY");
        if (r.packaging_status !== "COMPLETE") blockers.push("Consumer packaging is not certified COMPLETE");
        if (r.curation_status !== "APPROVED") blockers.push("Editorial curation is not APPROVED");
        if (r.delivery_status !== "READY") blockers.push("Final delivery is not certified READY");
        if (
          ![
            "LICENSING_READY",
            "LIVE_FOR_BUYERS",
            "IN_NEGOTIATION",
            "LICENSED",
            "DELIVERED",
          ].includes(r.status)
        ) {
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
                authorizationStatus: (r.authorization_status?.toUpperCase() ||
                  "PENDING") as DistributionAuthorizationStatus,
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
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");

    if (
      data.windowStart &&
      data.windowEnd &&
      new Date(data.windowEnd) <= new Date(data.windowStart)
    ) {
      throw new Error("Distribution window end date must be strictly after window start date.");
    }

    if (!data.exploitationModels.includes(data.accessTier)) {
      throw new Error("Consumer access tier must be covered by the requested exploitation models.");
    }
    return (await getSql()).transaction(async (sql) => {
      await sql`select id from bridge_titles where id=${data.bridgeTitleId} for update`;
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
      const existing = await sql<{
        id: string;
      }>`select id from loop_titles where bridge_title_id = ${title.id} limit 1`;
      const loopTitleId = existing[0]?.id ?? randomUUID();

      // 1. Synchronize master publication record in Crayons Loop
      await sql`
      insert into loop_titles (
        id, bridge_title_id, slug, title, synopsis, content_type, language, year,
        duration_minutes, poster_path, playback_path, metadata, status, listed,
        published, featured, access_tier, updated_at
      ) values (
        ${loopTitleId}, ${title.id}, ${title.slug}, ${title.name}, ${title.synopsis}, ${loopStageType(title.content_type)},
        ${title.language}, ${title.year}, ${title.runtime_minutes}, ${title.poster_key}, ${title.master_key},
        ${JSON.stringify({
          source: "crayons-bridge-master-distribution",
          lane: loopStageType(title.content_type),
          rightsGrantId: preflight.rightsGrantId,
          authorizedBy: actor.userId,
          commercialTerms: preflight.commercialTerms || null,
        })}::jsonb,
        ${"approved"}, true, true, false,
        ${data.accessTier}, now()
      )
      on conflict (bridge_title_id) do update set
        slug = excluded.slug, title = excluded.title, synopsis = excluded.synopsis,
        content_type = excluded.content_type,
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
          commercialTerms: preflight.commercialTerms || null,
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
      await writeAudit(
        {
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
            commercialTerms: preflight.commercialTerms,
          },
        },
        sql,
      );

      return { ok: true, loopTitleId, status: "AUTHORIZED" as const };
    });
  });

export const suspendLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1), reason: z.string().optional() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.suspend_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { reason: data.reason || "Operational suspension" },
        },
        sql,
      );

      return { ok: true, status: "SUSPENDED" as const };
    });
  });

export const revokeLoopPublication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.revoke");
    return (await getSql()).transaction(async (sql) => {
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

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.revoke_loop",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
        },
        sql,
      );

      return { ok: true, status: "REVOKED" as const };
    });
  });

export const extendDistributionWindow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bridgeTitleId: z.string().min(1),
      newWindowEnd: z.string().datetime(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    return (await getSql()).transaction(async (sql) => {
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
      if (!updated[0])
        throw new Error("Publication is no longer active; refresh before extending.");

      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "distribution.extend_window",
          entityType: "bridge_title",
          entityId: data.bridgeTitleId,
          metadata: { newWindowEnd: data.newWindowEnd, rightsGrantId: preflight.rightsGrantId },
        },
        sql,
      );

      return { ok: true, status: "EXTENDED" as const };
    });
  });

export const getLoopPublication = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ bridgeTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
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
