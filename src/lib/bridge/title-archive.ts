import type { Sql } from "@/lib/db";
import type { BridgeTitle } from "./types";
import { canMutateTitle } from "./rbac";

export const ARCHIVE_BLOCKED_STATUSES = [
  "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW",
  "LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION",
  "LICENSED", "DELIVERED",
] as const;

export function assertDraftCanBeArchived(input: {
  status: string;
  hasAssets: boolean;
  hasMaster: boolean;
  hasPoster: boolean;
  hasActiveDitSession: boolean;
  hasRightsRecords: boolean;
  hasQcRecords: boolean;
  hasLegalRecords: boolean;
  hasFinancialOrCommercialRecords: boolean;
}) {
  if (input.status !== "DRAFT") throw new Error("Only untouched DRAFT titles can be archived.");
  if (
    input.hasAssets || input.hasMaster || input.hasPoster ||
    input.hasActiveDitSession || input.hasRightsRecords ||
    input.hasQcRecords || input.hasLegalRecords ||
    input.hasFinancialOrCommercialRecords
  ) {
    throw new Error("This draft has linked assets, ingest, review, rights or commercial records and cannot be archived.");
  }
}

async function getArchiveDependencies(tx: Sql, titleId: string) {
  const rows = await tx<{ blocked: boolean }>`
    select
      exists(select 1 from bridge_assets where title_id = ${titleId}) or
      exists(select 1 from bridge_asset_versions where title_id = ${titleId}) or
      exists(select 1 from bridge_production_assets where title_id = ${titleId}) or
      exists(select 1 from bridge_dit_ingest_sessions where title_id = ${titleId}) or
      exists(select 1 from bridge_rights_grants where title_id = ${titleId}) or
      exists(select 1 from bridge_language_rights where title_id = ${titleId}) or
      exists(select 1 from bridge_qc_cases where title_id = ${titleId}) or
      exists(select 1 from bridge_legal_cases where title_id = ${titleId}) or
      exists(select 1 from bridge_title_submission_intake where title_id = ${titleId}) or
      exists(select 1 from bridge_title_gate_certifications where title_id = ${titleId}) or
      exists(select 1 from bridge_deals where title_id = ${titleId}) or
      exists(select 1 from bridge_financial_ledger where title_id = ${titleId}) or
      exists(select 1 from bridge_payments where title_id = ${titleId}) or
      exists(select 1 from bridge_entitlements where title_id = ${titleId}) or
      exists(select 1 from bridge_package_entitlements where title_id = ${titleId}) or
      exists(select 1 from bridge_loop_publications where bridge_title_id = ${titleId}) or
      exists(select 1 from bridge_service_orders where title_id = ${titleId}) or
      exists(select 1 from bridge_service_quotes where title_id = ${titleId}) or
      exists(select 1 from bridge_destination_packages where title_id = ${titleId}) or
      exists(select 1 from bridge_title_merge_aliases where canonical_title_id = ${titleId} or retiring_title_id = ${titleId}) or
      exists(select 1 from bridge_title_merge_audits where canonical_title_id = ${titleId} or retiring_title_id = ${titleId}) or
      exists(select 1 from bridge_delivery_jobs where title_id = ${titleId}) or
      exists(select 1 from bridge_desk_notes where title_id = ${titleId}) or
      exists(select 1 from loop_titles where bridge_title_id = ${titleId}) or
      exists(select 1 from streamvista_legacy_links where bridge_title_id = ${titleId}) or
      exists(select 1 from streamvista_orders where bridge_title_id = ${titleId}) as blocked
  `;
  return Boolean(rows[0]?.blocked);
}

function assertOwnerOrStudioMember(actor: Parameters<typeof canMutateTitle>[0], title: BridgeTitle) {
  if (!canMutateTitle(actor, title, "title.update_own", "title.license")) {
    throw new Error("You do not have permission to manage this title.");
  }
}

export async function archiveDraftTitle(
  tx: Sql,
  actor: Parameters<typeof canMutateTitle>[0],
  title: BridgeTitle,
) {
  assertOwnerOrStudioMember(actor, title);
  const locked = await tx<{ status: string; archived_at: string | null; poster_key: string | null; master_key: string | null }>`
    select status, archived_at, poster_key, master_key
    from bridge_titles where id = ${title.id} for update
  `;
  const row = locked[0];
  if (!row || row.status !== "DRAFT" || row.archived_at) {
    throw new Error("Title changed. Refresh and try again.");
  }
  const hasDeps = await getArchiveDependencies(tx, title.id);
  assertDraftCanBeArchived({
    status: row.status,
    hasAssets: hasDeps,
    hasMaster: Boolean(row.master_key),
    hasPoster: Boolean(row.poster_key),
    hasActiveDitSession: hasDeps,
    hasRightsRecords: hasDeps,
    hasQcRecords: hasDeps,
    hasLegalRecords: hasDeps,
    hasFinancialOrCommercialRecords: hasDeps,
  });
  const updated = await tx<{ id: string }>`
    update bridge_titles
    set archived_at = now(), archived_by = ${actor.userId}, archive_reason = 'OWNER_ARCHIVE',
        updated_at = now()
    where id = ${title.id} and status = 'DRAFT' and archived_at is null
    returning id
  `;
  if (!updated[0]) throw new Error("Title changed. Refresh and try again.");
  return updated[0].id;
}

export async function restoreArchivedDraft(
  tx: Sql,
  actor: Parameters<typeof canMutateTitle>[0],
  title: BridgeTitle,
) {
  assertOwnerOrStudioMember(actor, title);
  const rows = await tx<{ id: string; status: string; archived_at: string | null }>`
    select id, status, archived_at from bridge_titles where id = ${title.id} for update
  `;
  const row = rows[0];
  if (!row || row.status !== "DRAFT" || !row.archived_at) {
    throw new Error("Archived draft is not available to restore.");
  }
  const updated = await tx<{ id: string }>`
    update bridge_titles
    set archived_at = null, archived_by = null, archive_reason = null, updated_at = now()
    where id = ${title.id} and status = 'DRAFT' and archived_at is not null
    returning id
  `;
  if (!updated[0]) throw new Error("Title changed. Refresh and try again.");
  return updated[0].id;
}
