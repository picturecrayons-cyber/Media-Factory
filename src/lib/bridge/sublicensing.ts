import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertBridgeSublicensingAuthority } from "./distribution-mandate";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

const authorizeInput = z.object({
  titleId: z.string().min(8),
  rightsGrantId: z.string().uuid(),
  downstreamLicensee: z.string().trim().min(2).max(200),
  downstreamLicenseeReference: z.string().trim().min(2).max(500),
  territories: z.array(z.string().trim().min(2).max(80)).min(1).max(250),
  languages: z.array(z.string().trim().min(2).max(40)).min(1).max(20),
  media: z.array(z.string().trim().min(2).max(40)).min(1).max(20),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  restrictions: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  evidenceDocumentId: z.string().min(8).max(200),
  rightsEvidenceReviewed: z.literal(true),
  approvalReason: z.string().trim().min(12).max(2000),
}).superRefine((value, ctx) => {
  if (new Date(value.windowEnd) <= new Date(value.windowStart)) {
    ctx.addIssue({ code: "custom", path: ["windowEnd"], message: "Sublicense end must follow its start." });
  }
});

function subset(requested: string[], allowed: unknown): boolean {
  const values = Array.isArray(allowed) ? allowed.filter((value): value is string => typeof value === "string") : [];
  return requested.every((value) => values.includes(value));
}

/**
 * This is the only server command that may record a downstream sublicense.
 * Loop publication is deliberately not a sublicense and cannot call this command.
 */
export const authorizeBridgeSublicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(authorizeInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertBridgeSublicensingAuthority(actor);

    const startsAt = new Date(data.windowStart);
    const endsAt = new Date(data.windowEnd);
    if (endsAt <= startsAt || endsAt <= new Date()) throw new Error("Invalid or expired sublicense window.");

    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const grants = await tx<{
        id: string;
        title_id: string;
        status: string;
        territories: unknown;
        languages: unknown;
        media: unknown;
        window_start: string | Date | null;
        window_end: string | Date | null;
        sublicensing_allowed: boolean;
      }>`
        select id,title_id,status,territories,languages,media,window_start,window_end,sublicensing_allowed
        from bridge_rights_grants
        where id=${data.rightsGrantId} and title_id=${data.titleId}
        for update
      `;
      const grant = grants[0];
      if (!grant || grant.status !== "VALID") throw new Error("An active, legally approved title-specific rights grant is required.");
      if (!grant.window_start || !grant.window_end ||
          startsAt < new Date(grant.window_start) || endsAt > new Date(grant.window_end)) {
        throw new Error("The sublicense window exceeds the underlying rights grant.");
      }
      if (!subset(data.territories, grant.territories) ||
          !subset(data.languages, grant.languages) ||
          !subset(data.media, grant.media)) {
        throw new Error("The sublicense scope exceeds the underlying rights grant.");
      }

      const legal = await tx<{ approved: boolean }>`
        select exists (
          select 1 from bridge_legal_cases
          where title_id=${data.titleId} and status='APPROVED'
            and evidence->0->>'grantId'=${data.rightsGrantId}
        ) as approved
      `;
      if (!legal[0]?.approved) throw new Error("Independent Legal approval for this exact rights grant is required.");

      const evidence = await tx<{ id: string }>`
        select d.id
        from bridge_creator_documents d
        join bridge_title_document_links l on l.document_id=d.id
        where d.id=${data.evidenceDocumentId}
          and l.title_id=${data.titleId}
          and d.status='VERIFIED'
          and d.document_type in ('FINISHED_FILM_AGREEMENT','DISTRIBUTION_AGREEMENT')
        limit 1
      `;
      if (!evidence[0]) throw new Error("A verified, title-linked distribution or finished-film agreement is required.");

      // The explicit Bridge Super Admin decision is the only route that can
      // activate the grant's onward-sublicensing capability.
      await tx`
        update bridge_rights_grants set sublicensing_allowed=true
        where id=${grant.id} and title_id=${data.titleId} and status='VALID'
      `;
      const rows = await tx<{ id: string }>`
        insert into bridge_sublicense_authorizations (
          title_id,rights_grant_id,downstream_licensee,downstream_licensee_reference,
          territories,languages,media,window_start,window_end,restrictions,
          evidence_document_id,status,created_by
        ) values (
          ${data.titleId},${grant.id},${data.downstreamLicensee},${data.downstreamLicenseeReference},
          ${JSON.stringify(data.territories)}::jsonb,${JSON.stringify(data.languages)}::jsonb,
          ${JSON.stringify(data.media)}::jsonb,${data.windowStart},${data.windowEnd},
          ${JSON.stringify(data.restrictions)}::jsonb,${data.evidenceDocumentId},'AUTHORIZED',${actor.userId}
        ) returning id
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "bridge.sublicense.authorized",
        entityType: "bridge_sublicense_authorization",
        entityId: rows[0].id,
        metadata: {
          titleId: data.titleId,
          rightsGrantId: grant.id,
          downstreamLicensee: data.downstreamLicensee,
          downstreamLicenseeReference: data.downstreamLicenseeReference,
          territories: data.territories,
          languages: data.languages,
          media: data.media,
          windowStart: data.windowStart,
          windowEnd: data.windowEnd,
          evidenceDocumentId: data.evidenceDocumentId,
          rightsEvidenceReviewed: true,
          approvalReason: data.approvalReason,
        },
      }, tx);
      return { authorizationId: rows[0].id, status: "AUTHORIZED" as const };
    });
  });

export const revokeBridgeSublicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    authorizationId: z.string().uuid(),
    reason: z.string().trim().min(12).max(2000),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertBridgeSublicensingAuthority(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const rows = await tx<{ id: string; title_id: string; rights_grant_id: string }>`
        update bridge_sublicense_authorizations
        set status='REVOKED',updated_at=now()
        where id=${data.authorizationId} and status in ('AUTHORIZED','SUSPENDED')
        returning id,title_id,rights_grant_id
      `;
      if (!rows[0]) throw new Error("Active sublicense authorization not found.");
      await writeAudit({
        actorUserId: actor.userId,
        action: "bridge.sublicense.revoked",
        entityType: "bridge_sublicense_authorization",
        entityId: rows[0].id,
        metadata: { titleId: rows[0].title_id, rightsGrantId: rows[0].rights_grant_id, reason: data.reason },
      }, tx);
      return { authorizationId: rows[0].id, status: "REVOKED" as const };
    });
  });
