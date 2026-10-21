import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { loadTitle } from "./titles";
import { loopStageType } from "./loop-lanes";
import { requestAssetPreview } from "./assets";

export type AdminPreviewChecklist = {
  metadata: {
    ok: boolean;
    missing: string[];
    fields: {
      name: string;
      nameMl: string | null;
      synopsis: string;
      language: string;
      year: number | null;
      runtimeMinutes: number | null;
      contentType: string;
      countryOfOrigin: string | null;
      director: string | null;
      producer: string | null;
      cast: string[];
    };
  };
  assets: {
    ok: boolean;
    present: string[];
    missing: string[];
    details: Array<{
      id: string;
      kind: string;
      contentType: string | null;
      byteSize: number | null;
      verified: boolean;
    }>;
  };
  rights: {
    ok: boolean;
    status: string;
    grantsCount: number;
    activeGrantId: string | null;
    issues: string[];
  };
  qc: {
    ok: boolean;
    status: string;
    findings: string[];
    blockers: string[];
  };
  buyerVisibility: {
    isLive: boolean;
    status: string;
    visibilityGatePassed: boolean;
  };
};

export const getAdminTitlePreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    // Protected: must be internal staff with catalog read access
    if (!actor.internalRole) {
      throw new Error("Forbidden: Admin Preview is restricted to Crayons Bridge staff.");
    }
    assertPermission(actor, "title.read_catalog");

    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found.");

    const sql = await getSql();

    // 1. Assets from bridge_assets
    const assets = await sql<{
      id: string;
      kind: string;
      content_type: string | null;
      byte_size: number | null;
      s3_key: string | null;
      verified: boolean;
    }>`
      select id, kind, content_type, byte_size, s3_key, verified
      from bridge_assets
      where title_id = ${title.id}
      order by kind
    `;

    // 2. QC Cases
    const qcCases = await sql<{
      status: string;
      reviewer_findings: Array<{ note?: string; masterKey?: string | null; posterKey?: string | null }>;
      reviewed_at: string | Date | null;
    }>`
      select status, reviewer_findings, reviewed_at
      from bridge_qc_cases
      where title_id = ${title.id}
      order by created_at desc
      limit 1
    `;

    // 3. Rights Grants
    const rightsGrants = await sql<{
      id: string;
      status: string;
      territories: unknown;
      languages: unknown;
      window_start: string | Date | null;
      window_end: string | Date | null;
    }>`
      select id, status, territories, languages, window_start, window_end
      from bridge_rights_grants
      where title_id = ${title.id}
      order by created_at desc
    `;

    // 4. Buyer visibility check from real DB function
    const visibilityRows = await sql<{ visible: boolean }>`
      select public.bridge_title_buyer_visibility(${title.id}) as visible
    `.catch(() => [{ visible: false }]);

    // Evaluate missing metadata
    const missingMetadata: string[] = [];
    if (!title.name?.trim()) missingMetadata.push("Title name");
    if (!title.synopsis?.trim()) missingMetadata.push("Synopsis");
    if (!title.language?.trim()) missingMetadata.push("Language");
    if (!title.contentType?.trim()) missingMetadata.push("Content type");
    if (!title.year) missingMetadata.push("Release year");
    if (!title.runtimeMinutes) missingMetadata.push("Runtime duration");

    // Evaluate assets
    const kindsPresent = new Set(assets.filter((a) => a.verified && (a.byte_size ?? 0) > 0).map((a) => a.kind));
    const missingAssets: string[] = [];
    if (!kindsPresent.has("master")) missingAssets.push("Master Video");
    if (!kindsPresent.has("poster_vertical") && !kindsPresent.has("poster")) missingAssets.push("Vertical Poster");
    if (!kindsPresent.has("screener")) missingAssets.push("Private Screener");

    // Evaluate QC
    const latestQc = qcCases[0];
    const qcStatus = latestQc?.status ?? "NOT_SUBMITTED";
    const qcBlockers: string[] = [];
    if (qcStatus !== "PASSED") {
      if (qcStatus === "ACTION_REQUIRED") qcBlockers.push("QC rejected with findings — corrective action required");
      else if (qcStatus === "NOT_SUBMITTED") qcBlockers.push("Title has not yet completed QC review");
      else qcBlockers.push(`QC status is ${qcStatus}`);
    }
    if (!kindsPresent.has("master")) qcBlockers.push("Verified master asset is missing");

    // Evaluate Rights
    const activeGrant = rightsGrants.find((g) => g.status === "VALID");
    const rightsIssues: string[] = [];
    if (!activeGrant) {
      rightsIssues.push("No active VALID rights grant recorded for this title");
    }

    const directorCredit = title.credits?.find((c) => c.role.toLowerCase() === "director")?.name ?? null;
    const producerCredit = title.credits?.find((c) => c.role.toLowerCase() === "producer")?.name ?? null;
    const castCredits = (title.credits ?? []).filter((c) => c.role.toLowerCase() === "cast").map((c) => c.name);

    // Secure preview URL for poster if available
    let posterUrl: string | null = null;
    const posterAsset = assets.find(
      (a) => a.verified && ["poster_vertical", "poster"].includes(a.kind) && a.content_type?.startsWith("image/"),
    );
    if (posterAsset) {
      try {
        const preview = await requestAssetPreview({ data: { assetId: posterAsset.id } });
        posterUrl = preview.url;
      } catch {
        posterUrl = null;
      }
    }

    // Secure preview URL for screener or master if available
    let videoPreviewUrl: string | null = null;
    const videoAsset = assets.find(
      (a) => a.verified && ["screener", "master"].includes(a.kind) && (a.byte_size ?? 0) > 0,
    );
    if (videoAsset) {
      try {
        const preview = await requestAssetPreview({ data: { assetId: videoAsset.id } });
        videoPreviewUrl = preview.url;
      } catch {
        videoPreviewUrl = null;
      }
    }

    const checklist: AdminPreviewChecklist = {
      metadata: {
        ok: missingMetadata.length === 0,
        missing: missingMetadata,
        fields: {
          name: title.name,
          nameMl: title.nameMl,
          synopsis: title.synopsis,
          language: title.language,
          year: title.year,
          runtimeMinutes: title.runtimeMinutes,
          contentType: loopStageType(title.contentType),
          countryOfOrigin: title.countryOfOrigin,
          director: directorCredit,
          producer: producerCredit,
          cast: castCredits,
        },
      },
      assets: {
        ok: missingAssets.length === 0,
        present: Array.from(kindsPresent),
        missing: missingAssets,
        details: assets.map((a) => ({
          id: a.id,
          kind: a.kind,
          contentType: a.content_type,
          byteSize: a.byte_size,
          verified: a.verified,
        })),
      },
      rights: {
        ok: Boolean(activeGrant),
        status: activeGrant?.status ?? "NONE",
        grantsCount: rightsGrants.length,
        activeGrantId: activeGrant?.id ?? null,
        issues: rightsIssues,
      },
      qc: {
        ok: qcStatus === "PASSED",
        status: qcStatus,
        findings: (latestQc?.reviewer_findings ?? []).map((f) => f.note || "").filter(Boolean),
        blockers: qcBlockers,
      },
      buyerVisibility: {
        isLive: ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status),
        status: title.status,
        visibilityGatePassed: Boolean(visibilityRows[0]?.visible),
      },
    };

    return {
      title,
      isInternalAdminPreview: true,
      buyerVisible: checklist.buyerVisibility.isLive && checklist.buyerVisibility.visibilityGatePassed,
      checklist,
      previewMedia: {
        posterUrl,
        videoPreviewUrl,
      },
      actorRole: actor.internalRole,
    };
  });
