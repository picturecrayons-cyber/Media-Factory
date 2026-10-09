import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";

export type DistributionAvailsRow = {
  id: string;
  name: string;
  language: string | null;
  year: number | null;
  runtime_minutes: number | null;
  content_type: string | null;
  status: string;
  master_key: string | null;
  poster_key: string | null;
  master_verified: boolean;
  qc_verified: boolean;
  legal_review_recorded: boolean;
  valid_rights_grants: Array<{
    id: string;
    territories: unknown;
    languages: unknown;
    media: unknown;
    window_start: string | Date | null;
    window_end: string | Date | null;
    exclusivity: string;
    holdbacks: unknown;
  }>;
};

export function assessDistributionAvails(row: DistributionAvailsRow, now = new Date()) {
  const blockers: string[] = [];
  if (!row.name.trim() || !row.language?.trim() || !row.year || !row.runtime_minutes || !row.content_type?.trim()) {
    blockers.push("Core metadata is incomplete");
  }
  if (!row.master_key || !row.master_verified) blockers.push("Current master asset is not verified");
  if (!row.poster_key) blockers.push("Poster/artwork is missing");
  if (!row.qc_verified) blockers.push("Current master/artwork QC sign-off is missing");
  if (!row.legal_review_recorded) blockers.push("Recorded legal review evidence is missing");
  const activeGrants = row.valid_rights_grants.filter((grant) => {
    if (!Array.isArray(grant.territories) || !grant.territories.length ||
        !Array.isArray(grant.languages) || !grant.languages.length ||
        !Array.isArray(grant.media) || !grant.media.length ||
        !grant.window_start || !grant.window_end) return false;
    const start = new Date(grant.window_start);
    const end = new Date(grant.window_end);
    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start <= now && end > now && end > start;
  });
  if (!activeGrants.length) blockers.push("No current, structured rights grant with explicit territory, language, media and finite window");
  const hasConflict = activeGrants.some((grant) => {
    const territories = grant.territories as unknown[];
    const media = grant.media as unknown[];
    const holdbacks = Array.isArray(grant.holdbacks) ? grant.holdbacks : [];
    return territories.some((value) => typeof value !== "string" || !value.trim()) ||
      media.some((value) => typeof value !== "string" || !value.trim()) ||
      holdbacks.some((value) => typeof value !== "string" || !value.trim());
  });
  if (hasConflict) blockers.push("Rights dimensions or holdbacks contain invalid structured values");
  return {
    decision: blockers.length === 0 ? "NEEDS_OPERATOR_REVIEW" as const : "HOLD" as const,
    blockers,
    rightsGrantCount: activeGrants.length,
  };
}

/** Read-only, fail-closed report. This function never creates or changes catalog records. */
export const listDistributionAvails = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const sql = await getSql();
    const rows = await sql<DistributionAvailsRow>`
      select
        t.id, t.name, t.language, t.year, t.runtime_minutes, t.content_type, t.status,
        t.master_key, t.poster_key,
        exists (
          select 1 from bridge_assets a
          where a.title_id = t.id and a.kind = 'master'
            and a.s3_key = t.master_key and coalesce(a.byte_size, 0) > 0
        ) as master_verified,
        exists (
          select 1 from bridge_qc_cases q
          where q.title_id = t.id and q.status = 'PASSED'
            and q.reviewer_findings->0->>'masterKey' = t.master_key
            and q.reviewer_findings->0->>'posterKey' = t.poster_key
        ) as qc_verified,
        exists (
          select 1 from bridge_legal_cases l
          where l.title_id = t.id and l.status = 'APPROVED'
            and jsonb_typeof(l.evidence) = 'array' and jsonb_array_length(l.evidence) > 0
        ) as legal_review_recorded,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id, 'territories', g.territories, 'languages', g.languages,
            'media', g.media, 'window_start', g.window_start, 'window_end', g.window_end,
            'exclusivity', g.exclusivity, 'holdbacks', g.holdbacks
          ))
          from bridge_rights_grants g
          where g.title_id = t.id and g.status = 'VALID'
        ), '[]'::jsonb) as valid_rights_grants
      from bridge_titles t
      where t.merged_into_title_id is null
      order by t.name asc, t.id asc
      limit 300
    `;
    return {
      generatedAt: new Date().toISOString(),
      readOnly: true as const,
      rows: rows.map((row) => ({ ...row, assessment: assessDistributionAvails(row) })),
    };
  });
