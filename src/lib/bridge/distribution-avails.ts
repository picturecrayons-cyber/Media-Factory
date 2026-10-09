import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { assertNotDevUser } from "./guards";
import { assessDistributionAvails, type DistributionAvailsRow } from "./distribution-avails-policy";

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
            'media', g.media, 'window_start', g.window_start::text, 'window_end', g.window_end::text,
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
    const serializableRows = JSON.parse(JSON.stringify(rows)) as DistributionAvailsRow[];
    return {
      generatedAt: new Date().toISOString(),
      readOnly: true as const,
      rows: serializableRows.map((row) => ({ ...row, assessment: assessDistributionAvails(row) })),
    };
  });
