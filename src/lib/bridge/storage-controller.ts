import { getSql } from "@/lib/db";
import { evaluateStoragePolicy, type StorageTier } from "./storage-policy.ts";

export type StorageControllerResult = {
  evaluated: number;
  changes: number;
  blocked: number;
  decisions: Array<{ assetId: string; from: StorageTier; to: StorageTier; reason: string }>;
};

export async function evaluateStorageController(now = new Date()): Promise<StorageControllerResult> {
  const sql = await getSql();
  const rows = await sql`
    select a.id, a.kind, a.storage_tier, a.storage_business_state,
           a.storage_policy, a.last_accessed_at, a.legal_hold,
           a.commercial_hold, a.restore_state, t.status as title_status
      from bridge_assets a
      join bridge_titles t on t.id = a.title_id
     where a.restore_state in ('READY', 'AVAILABLE')
       and a.storage_policy <> 'MANUAL'
     order by a.created_at asc
  `;

  const result: StorageControllerResult = { evaluated: rows.length, changes: 0, blocked: 0, decisions: [] };
  for (const asset of rows as Array<Record<string, unknown>>) {
    const decision = evaluateStoragePolicy({
      assetKind: String(asset.kind),
      titleStatus: String(asset.title_status),
      businessState: asset.storage_business_state as never,
      legalHold: Boolean(asset.legal_hold),
      commercialHold: Boolean(asset.commercial_hold),
      lastAccessedAt: asset.last_accessed_at ? new Date(String(asset.last_accessed_at)) : null,
      now,
    });
    const current = String(asset.storage_tier) as StorageTier;
    const target = decision.recommendedTier;
    if (!decision.allowedTiers.includes(current) && current !== target) {
      result.blocked += 1;
      continue;
    }
    if (current !== target) {
      result.changes += 1;
      result.decisions.push({ assetId: String(asset.id), from: current, to: target, reason: decision.reason });
    }
  }
  return result;
}

export async function runStorageController() {
  throw new Error("Physical OCI tier mutation is disabled until the OCI tier adapter is certified.");
}
