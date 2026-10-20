import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission, hasStaffPermission } from "./rbac";
import { loadTitle } from "./titles";
import { authorizeLoopPublication } from "./loop-publication";
import {
  type LoopHandoffState,
  evaluateLoopHandoffState,
} from "./admin-workflow-policy";

export type { LoopHandoffState };
export { evaluateLoopHandoffState };

export type LoopHandoffDetails = {
  state: LoopHandoffState;
  titleId: string;
  titleName: string;
  loopTitleId: string | null;
  submissionId: string | null;
  authorizationStatus: string | null;
  published: boolean;
  blockers: string[];
  canInitiate: boolean;
  grant: {
    id: string;
    status: string;
    territories: string[];
    languages: string[];
    windowStart: string | null;
    windowEnd: string | null;
    exclusivity: string | null;
  } | null;
  qcPassed: boolean;
  legalApproved: boolean;
  updatedAt: string | null;
};

export const getLoopHandoffDetails = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }): Promise<LoopHandoffDetails> => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Title not found.");

    const sql = await getSql();

    const [pubRows, loopRows, grantRows, qcRows, legalRows] = await Promise.all([
      sql<{
        id: string;
        loop_title_id: string;
        authorization_status: string;
        window_start: string | Date | null;
        window_end: string | Date | null;
        metadata: unknown;
        updated_at: string | Date | null;
      }>`
        select id, loop_title_id, authorization_status, window_start, window_end, metadata, updated_at
        from bridge_loop_publications
        where bridge_title_id = ${title.id}
        limit 1
      `,
      sql<{
        id: string;
        published: boolean;
        listed: boolean;
        status: string;
      }>`
        select id, published, listed, status
        from loop_titles
        where bridge_title_id = ${title.id}
        limit 1
      `,
      sql<{
        id: string;
        status: string;
        territories: string[];
        languages: string[];
        window_start: string | Date | null;
        window_end: string | Date | null;
        exclusivity: string | null;
      }>`
        select id, status, territories, languages, window_start, window_end, exclusivity
        from bridge_rights_grants
        where title_id = ${title.id} and status in ('VALID', 'DRAFT')
        order by created_at desc
        limit 1
      `,
      sql<{ status: string }>`
        select status from bridge_qc_cases
        where title_id = ${title.id}
        order by created_at desc limit 1
      `,
      sql<{ status: string }>`
        select status from bridge_legal_cases
        where title_id = ${title.id}
        order by created_at desc limit 1
      `,
    ]);

    const pub = pubRows[0] ?? null;
    const loop = loopRows[0] ?? null;
    const grant = grantRows[0] ?? null;
    const qcPassed = qcRows[0]?.status === "PASSED";
    const legalApproved = legalRows[0]?.status === "APPROVED" || grant?.status === "VALID";

    const { state, blockers } = evaluateLoopHandoffState({
      qcPassed,
      grantValid: Boolean(grant && grant.status === "VALID"),
      hasMasterKey: Boolean(title.masterKey),
      hasPosterKey: Boolean(title.posterKey),
      pubStatus: pub?.authorization_status ?? null,
      loopPublished: Boolean(loop?.published),
    });

    const canInitiate =
      (state === "READY_FOR_REVIEW" || state === "FAILED") &&
      Boolean(actor.internalRole && hasStaffPermission(actor, "loop.publish"));

    return {
      state,
      titleId: title.id,
      titleName: title.name,
      loopTitleId: pub?.loop_title_id ?? loop?.id ?? null,
      submissionId: pub?.id ?? null,
      authorizationStatus: pub?.authorization_status ?? null,
      published: Boolean(loop?.published),
      blockers,
      canInitiate,
      grant: grant
        ? {
            id: grant.id,
            status: grant.status,
            territories: Array.isArray(grant.territories) ? grant.territories : ["WORLDWIDE"],
            languages: Array.isArray(grant.languages) ? grant.languages : [title.language],
            windowStart: grant.window_start ? new Date(grant.window_start).toISOString() : null,
            windowEnd: grant.window_end ? new Date(grant.window_end).toISOString() : null,
            exclusivity: grant.exclusivity,
          }
        : null,
      qcPassed,
      legalApproved,
      updatedAt: pub?.updated_at ? new Date(pub.updated_at).toISOString() : null,
    };
  });

export const initiateLoopHandoff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      bridgeTitleId: z.string().min(8),
      notes: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");

    const handoff = await getLoopHandoffDetails({ data: { titleId: data.bridgeTitleId } });

    // Idempotency check: if already acknowledged, return cleanly
    if (handoff.state === "ACKNOWLEDGED" && handoff.loopTitleId) {
      return {
        ok: true,
        alreadyAcknowledged: true,
        state: "ACKNOWLEDGED",
        loopTitleId: handoff.loopTitleId,
        message: "Title is already synchronized and acknowledged on Crayons Loop.",
      };
    }

    if (handoff.blockers.length > 0) {
      throw new Error(`Cannot initiate Loop handoff. Blockers: ${handoff.blockers.join(" · ")}`);
    }

    const grant = handoff.grant;
    if (!grant || grant.status !== "VALID") {
      throw new Error("Valid rights grant required for Loop handoff.");
    }

    // Call authorizeLoopPublication
    const result = await authorizeLoopPublication({
      data: {
        bridgeTitleId: data.bridgeTitleId,
        destination: "CRAYONS_LOOP",
        territories: grant.territories,
        languages: grant.languages,
        exploitationModels: ["TVOD"],
        accessTier: "TVOD",
        windowStart: grant.windowStart,
        windowEnd: grant.windowEnd,
        commercialTerms: {
          rightsOwnerSharePct: 70,
          distributorSharePct: 30,
          notes: data.notes || "Automated safe handoff from Bridge Super Admin",
        },
      },
    });

    return {
      ok: true,
      alreadyAcknowledged: false,
      state: "ACKNOWLEDGED" as const,
      loopTitleId: result.loopTitleId,
      message: "License and metadata successfully published and acknowledged by Crayons Loop.",
    };
  });
