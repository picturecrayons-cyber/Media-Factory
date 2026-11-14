import type { Sql } from "@/lib/db";

/**
 * Incoming operational queue includes Creator and Studio titles as soon as
 * they enter review preparation. Intake metadata is optional: standard
 * workspace submissions do not necessarily create a rights-intake row.
 */
export async function listIncomingSubmissions(sql: Sql) {
  return sql<{
    title_id: string;
    title_name: string;
    status: string;
    owner_user_id: string;
    owner_account_type: string;
    owner_display_name: string | null;
    owner_email: string | null;
    owner_organization_name: string | null;
    authority_type: string | null;
    authorization_evidence_type: string | null;
    authorization_confirmed: boolean | null;
    buyer_channels: unknown;
    screener_mode: string | null;
    submitted_at: string | Date | null;
    updated_at: string | Date;
  }>`select t.id as title_id, t.name as title_name, t.status,
      t.owner_user_id, t.owner_account_type,
      p.display_name as owner_display_name, p.email as owner_email,
      coalesce(o.legal_name, p.organization_name) as owner_organization_name,
      i.authority_type, i.authorization_evidence_type, i.authorization_confirmed,
      i.buyer_channels, i.screener_mode,
      coalesce(i.submitted_at, t.updated_at) as submitted_at,
      t.updated_at
    from bridge_titles t
    left join bridge_title_submission_intake i on i.title_id = t.id
    left join bridge_profiles p on p.user_id = t.owner_user_id
    left join bridge_organizations o on o.id = t.owner_organization_id
    where t.status in ('PREPARING', 'QC_REVIEW', 'RIGHTS_REVIEW')
      and t.submission_type is distinct from 'story_concept'
      and t.merged_into_title_id is null
    order by coalesce(i.submitted_at, t.updated_at) desc
    limit 200`;
}
