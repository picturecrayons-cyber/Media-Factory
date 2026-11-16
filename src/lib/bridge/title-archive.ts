import type { Sql } from "@/lib/db";
import type { BridgeTitle } from "./types";
import type { Actor } from "./rbac";
import { canMutateTitle } from "./rbac";

export function assertDraftCanBeArchived(input: {
  status: string;
  hasAssets: boolean;
  hasMaster: boolean;
  hasPoster: boolean;
  hasDitSession: boolean;
  hasRights: boolean;
  hasReview: boolean;
  hasCommercial: boolean;
}) {
  if (input.status !== "DRAFT") throw new Error("Only DRAFT titles can be archived.");
  if (input.hasAssets || input.hasMaster || input.hasPoster || input.hasDitSession ||
      input.hasRights || input.hasReview || input.hasCommercial) {
    throw new Error("This draft has linked media, ingest, review, rights or commercial records and cannot be archived.");
  }
}

async function hasDependency(tx: Sql, titleId: string): Promise<boolean> {
  // These names and FK columns were verified against the live Crayons Bridge
  // Production schema on 16 Nov 2026. Unknown/new dependency tables must be
  // added here before archival is considered safe.
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
      exists(select 1 from bridge_license_packages where title_id = ${titleId}) or
      exists(select 1 from bridge_loop_publications where bridge_title_id = ${titleId}) or
      exists(select 1 from bridge_service_orders where title_id = ${titleId}) or
      exists(select 1 from bridge_service_quotes where title_id = ${titleId}) or
      exists(select 1 from bridge_service_settlement_rules where title_id = ${titleId}) or
      exists(select 1 from bridge_title_settlements where title_id = ${titleId}) or
      exists(select 1 from bridge_destination_packages where title_id = ${titleId}) or
      exists(select 1 from bridge_delivery_jobs where title_id = ${titleId}) or
      exists(select 1 from bridge_desk_notes where title_id = ${titleId}) or
      exists(select 1 from bridge_buyer_title_access where title_id = ${titleId}) or
      exists(select 1 from bridge_title_investors where title_id = ${titleId}) or
      exists(select 1 from bridge_title_merge_aliases where canonical_title_id = ${titleId}) or
      exists(select 1 from bridge_title_merge_audits where canonical_title_id = ${titleId}) or
      exists(select 1 from loop_titles where bridge_title_id = ${titleId}) or
      exists(select 1 from streamvista_legacy_links where bridge_title_id = ${titleId}) or
      exists(select 1 from streamvista_orders where bridge_title_id = ${titleId}) as blocked
  `;
  return Boolean(rows[0]?.blocked);
}

function assertActorMayManage(actor: Actor, title: BridgeTitle) {
  if (!actor.emailVerified) throw new Error("Email verification required.");
  if (actor.internalRole) {
    if (actor.internalRole !== "super_admin") throw new Error("Only Super Admin can manage another account's archived drafts.");
    return;
  }
  if (!["independent_creator", "studio"].includes(actor.accountType) ||
      !canMutateTitle(actor, title, "title.update_own", "title.license")) {
    throw new Error("Only the verified owner or an active member of the owning Studio can manage this draft.");
  }
}

export async function canArchiveDraftTitle(tx: Sql, actor: Actor, title: BridgeTitle): Promise<boolean> {
  try {
    assertActorMayManage(actor, title);
    if (title.status !== "DRAFT" || title.masterKey || title.posterKey) return false;
    const rows = await tx<{ blocked: boolean }>`
      select exists(select 1 from bridge_assets where title_id = ${title.id}) or
        exists(select 1 from bridge_asset_versions where title_id = ${title.id}) or
        exists(select 1 from bridge_production_assets where title_id = ${title.id}) or
        exists(select 1 from bridge_dit_ingest_sessions where title_id = ${title.id}) or
        exists(select 1 from bridge_rights_grants where title_id = ${title.id}) or
        exists(select 1 from bridge_language_rights where title_id = ${title.id}) or
        exists(select 1 from bridge_qc_cases where title_id = ${title.id}) or
        exists(select 1 from bridge_legal_cases where title_id = ${title.id}) or
        exists(select 1 from bridge_title_submission_intake where title_id = ${title.id}) or
        exists(select 1 from bridge_title_gate_certifications where title_id = ${title.id}) or
        exists(select 1 from bridge_deals where title_id = ${title.id}) or
        exists(select 1 from bridge_financial_ledger where title_id = ${title.id}) or
        exists(select 1 from bridge_payments where title_id = ${title.id}) or
        exists(select 1 from bridge_entitlements where title_id = ${title.id}) or
        exists(select 1 from bridge_package_entitlements where title_id = ${title.id}) or
        exists(select 1 from bridge_license_packages where title_id = ${title.id}) or
        exists(select 1 from bridge_loop_publications where bridge_title_id = ${title.id}) or
        exists(select 1 from bridge_service_orders where title_id = ${title.id}) or
        exists(select 1 from bridge_service_quotes where title_id = ${title.id}) or
        exists(select 1 from bridge_service_settlement_rules where title_id = ${title.id}) or
        exists(select 1 from bridge_title_settlements where title_id = ${title.id}) or
        exists(select 1 from bridge_destination_packages where title_id = ${title.id}) or
        exists(select 1 from bridge_delivery_jobs where title_id = ${title.id}) or
        exists(select 1 from bridge_desk_notes where title_id = ${title.id}) or
        exists(select 1 from bridge_buyer_title_access where title_id = ${title.id}) or
        exists(select 1 from bridge_title_investors where title_id = ${title.id}) or
        exists(select 1 from bridge_title_merge_aliases where canonical_title_id = ${title.id}) or
        exists(select 1 from bridge_title_merge_audits where canonical_title_id = ${title.id}) or
        exists(select 1 from loop_titles where bridge_title_id = ${title.id}) or
        exists(select 1 from streamvista_legacy_links where bridge_title_id = ${title.id}) or
        exists(select 1 from streamvista_orders where bridge_title_id = ${title.id}) as blocked
    `;
    return !Boolean(rows[0]?.blocked);
  } catch {
    return false;
  }
}

export async function archiveDraftTitle(tx: Sql, actor: Actor, title: BridgeTitle) {
  assertActorMayManage(actor, title);
  const locked = await tx<{
    id: string; status: string; archived_at: string | null;
    poster_key: string | null; master_key: string | null;
  }>`
    select id, status, archived_at, poster_key, master_key
    from bridge_titles where id = ${title.id} for update
  `;
  const row = locked[0];
  if (!row || row.status !== "DRAFT" || row.archived_at) {
    throw new Error("Title changed or is already archived. Refresh and try again.");
  }
  const blocked = await hasDependency(tx, title.id);
  assertDraftCanBeArchived({
    status: row.status,
    hasAssets: blocked,
    hasMaster: Boolean(row.master_key),
    hasPoster: Boolean(row.poster_key),
    hasDitSession: blocked,
    hasRights: blocked,
    hasReview: blocked,
    hasCommercial: blocked,
  });
  const updated = await tx<{ id: string }>`
    update bridge_titles
    set archived_at = now(), archived_by = ${actor.userId},
        archive_reason = 'DRAFT_ARCHIVE', updated_at = now()
    where id = ${title.id} and status = 'DRAFT' and archived_at is null
    returning id
  `;
  if (!updated[0]) throw new Error("Title changed. Refresh and try again.");
  return updated[0].id;
}

export async function restoreArchivedDraft(tx: Sql, actor: Actor, title: BridgeTitle) {
  assertActorMayManage(actor, title);
  const locked = await tx<{ id: string; status: string; archived_at: string | null }>`
    select id, status, archived_at from bridge_titles where id = ${title.id} for update
  `;
  if (!locked[0] || locked[0].status !== "DRAFT" || !locked[0].archived_at) {
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
