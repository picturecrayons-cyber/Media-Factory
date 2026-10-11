import { getSql } from "@/lib/db";
import { evaluateStoragePolicy, type StorageTier } from "./storage-policy.ts";

export type StorageControllerResult = {
  evaluated: number;
  changes: number;
  blocked: number;
  gbByTier: Record<StorageTier, number>;
  estimatedMonthlyCost: number;
  estimatedMonthlySavingsVsStandard: number;
  transitionedGbByTier: Record<StorageTier, number>;
  transitionCount: number;
  restoreCount: number;
  decisions: Array<{ assetId: string; from: StorageTier; to: StorageTier; reason: string }>;
};

export async function evaluateStorageController(now = new Date()): Promise<StorageControllerResult> {
  const sql = await getSql();
  const rows = await sql`
    select a.id, a.kind, a.storage_tier, a.storage_business_state,
           a.storage_policy, a.last_accessed_at, a.legal_hold,
           a.commercial_hold, a.restore_state, a.byte_size, t.status as title_status
      from bridge_assets a
      join bridge_titles t on t.id = a.title_id
     where a.restore_state in ('READY', 'AVAILABLE')
       and a.storage_policy <> 'MANUAL'
     order by a.created_at asc
  `;
  // Restoration is a separate workflow metric: restoring assets are intentionally
  // excluded from policy evaluation above, but must still be counted here.
  const restoringRows = await sql`
    select count(*)::int as count
      from bridge_assets
     where restore_state = 'RESTORING'
  `;

  const gbByTier: Record<StorageTier, number> = { STANDARD: 0, INFREQUENT: 0, ARCHIVE: 0 };
  const transitionedGbByTier: Record<StorageTier, number> = { STANDARD: 0, INFREQUENT: 0, ARCHIVE: 0 };
  const result: StorageControllerResult = {
    evaluated: rows.length,
    changes: 0,
    blocked: 0,
    gbByTier,
    estimatedMonthlyCost: 0,
    estimatedMonthlySavingsVsStandard: 0,
    transitionedGbByTier,
    transitionCount: 0,
    restoreCount: 0,
    decisions: [],
  };
  for (const asset of rows as Array<Record<string, unknown>>) {
    const sizeGb = Number(asset.byte_size || 0) / (1024 ** 3);
    const currentTier = String(asset.storage_tier) as StorageTier;
    if (currentTier in gbByTier && Number.isFinite(sizeGb) && sizeGb > 0) gbByTier[currentTier] += sizeGb;
    const decision = evaluateStoragePolicy({
      assetKind: String(asset.kind),
      titleStatus: String(asset.title_status),
      businessState: asset.storage_business_state as never,
      legalHold: Boolean(asset.legal_hold),
      commercialHold: Boolean(asset.commercial_hold),
      lastAccessedAt: asset.last_accessed_at ? new Date(String(asset.last_accessed_at)) : null,
      now,
    });
    const current = currentTier;
    const target = decision.recommendedTier;
    if (!decision.allowedTiers.includes(current) && current !== target) {
      result.blocked += 1;
      continue;
    }
    if (current !== target) {
      result.changes += 1;
      result.decisions.push({ assetId: String(asset.id), from: current, to: target, reason: decision.reason });
      result.transitionCount += 1;
      if (Number.isFinite(sizeGb) && sizeGb > 0) result.transitionedGbByTier[target] += sizeGb;
    }
  }
  // Planning estimates only (USD/GB-month); validate/configure against the account's
  // current OCI region, tier, and retrieval/transaction charges before financial use.
  const monthlyRatePerGb: Record<StorageTier, number> = { STANDARD: 0.025, INFREQUENT: 0.01, ARCHIVE: 0.0025 };
  result.estimatedMonthlyCost = Object.entries(gbByTier).reduce((sum, [tier, gb]) => sum + gb * monthlyRatePerGb[tier as StorageTier], 0);
  const totalGb = Object.values(gbByTier).reduce((sum, gb) => sum + gb, 0);
  result.estimatedMonthlySavingsVsStandard = Math.max(0, totalGb * monthlyRatePerGb.STANDARD - result.estimatedMonthlyCost);
  result.restoreCount = Number(restoringRows[0]?.count ?? 0);
  return result;
}

export async function runStorageController() {
  throw new Error("Physical OCI tier mutation is disabled until the OCI tier adapter is certified.");
}
