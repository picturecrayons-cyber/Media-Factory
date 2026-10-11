export const STORAGE_TIERS = ["STANDARD", "INFREQUENT", "ARCHIVE"] as const;
export type StorageTier = (typeof STORAGE_TIERS)[number];

export const STORAGE_BUSINESS_STATES = [
  "ACTIVE",
  "STREAMING",
  "COMMERCIAL",
  "DELIVERY",
  "PRESERVATION",
  "TEMPORARY",
  "ABANDONED",
] as const;
export type StorageBusinessState = (typeof STORAGE_BUSINESS_STATES)[number];

export type StoragePolicyInput = {
  assetKind: string;
  titleStatus: string;
  businessState?: StorageBusinessState;
  loopPublished?: boolean;
  loopPlaybackActive?: boolean;
  licenseActive?: boolean;
  deliveryActive?: boolean;
  qcRequired?: boolean;
  legalHold?: boolean;
  commercialHold?: boolean;
  lastAccessedAt?: Date | null;
  now?: Date;
};

export type StoragePolicyDecision = {
  recommendedTier: StorageTier;
  allowedTiers: StorageTier[];
  protected: boolean;
  reason: string;
};

const ACTIVE_TITLE_STATUSES = new Set([
  "DRAFT",
  "UPLOADING",
  "PREPARING",
  "QC_REVIEW",
  "RIGHTS_REVIEW",
  "LICENSING_READY",
  "LIVE_FOR_BUYERS",
  "IN_NEGOTIATION",
]);

export function evaluateStoragePolicy(input: StoragePolicyInput): StoragePolicyDecision {
  const now = input.now ?? new Date();
  const lastAccess = input.lastAccessedAt?.getTime();
  const daysSinceAccess =
    lastAccess == null || !Number.isFinite(lastAccess)
      ? Number.POSITIVE_INFINITY
      : Math.max(0, (now.getTime() - lastAccess) / 86_400_000);

  if (input.legalHold || input.commercialHold || input.deliveryActive || input.licenseActive) {
    return {
      recommendedTier: "STANDARD",
      allowedTiers: ["STANDARD", "INFREQUENT"],
      protected: true,
      reason: "Protected by legal, commercial, or active delivery requirements.",
    };
  }

  if (input.loopPlaybackActive || input.loopPublished || input.titleStatus === "LIVE_FOR_BUYERS") {
    return {
      recommendedTier: "STANDARD",
      allowedTiers: ["STANDARD", "INFREQUENT"],
      protected: true,
      reason: "Loop playback/publication requires a readily retrievable playback asset.",
    };
  }

  if (input.assetKind === "master" && ACTIVE_TITLE_STATUSES.has(input.titleStatus)) {
    if (daysSinceAccess >= 90) {
      return {
        recommendedTier: "INFREQUENT",
        allowedTiers: ["STANDARD", "INFREQUENT"],
        protected: true,
        reason: "Active master is cold, but must remain readily retrievable for production and licensing.",
      };
    }
    return {
      recommendedTier: "STANDARD",
      allowedTiers: ["STANDARD", "INFREQUENT"],
      protected: true,
      reason: "Active production or licensing master.",
    };
  }

  if (input.businessState === "TEMPORARY" || input.businessState === "ABANDONED") {
    return {
      recommendedTier: "INFREQUENT",
      allowedTiers: ["STANDARD", "INFREQUENT"],
      protected: false,
      reason: "Temporary/abandoned assets should enter a review-and-retention path before deletion.",
    };
  }

  if (input.businessState === "PRESERVATION") {
    return {
      recommendedTier: "ARCHIVE",
      allowedTiers: ["INFREQUENT", "ARCHIVE"],
      protected: true,
      reason: "Explicit preservation state allows controlled archival.",
    };
  }

  if (input.businessState === "DELIVERY" || input.licenseActive) {
    return {
      recommendedTier: "STANDARD",
      allowedTiers: ["STANDARD", "INFREQUENT"],
      protected: true,
      reason: "Current licensing or delivery activity requires fast retrieval.",
    };
  }

  if (daysSinceAccess >= 180) {
    return {
      recommendedTier: "INFREQUENT",
      allowedTiers: ["STANDARD", "INFREQUENT"],
      protected: false,
      reason: "Asset has been inactive for a long period and can be cost-optimized.",
    };
  }

  return {
    recommendedTier: "STANDARD",
    allowedTiers: ["STANDARD", "INFREQUENT"],
    protected: false,
    reason: "Default safe tier for currently active or recently accessed media.",
  };
}

export function canDeleteAsset(input: StoragePolicyInput & {
  retentionUntil?: Date | null;
  isSoleMaster?: boolean;
  isInActivePackage?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.legalHold || input.commercialHold || input.deliveryActive) return false;
  if (ACTIVE_TITLE_STATUSES.has(input.titleStatus) || input.titleStatus === "LICENSED" || input.titleStatus === "DELIVERED") return false;
  if (input.licenseActive || input.loopPublished || input.loopPlaybackActive) return false;
  if (input.isSoleMaster || input.isInActivePackage) return false;
  if (!input.retentionUntil || input.retentionUntil.getTime() > now.getTime()) return false;
  return input.businessState === "TEMPORARY" || input.businessState === "ABANDONED";
}
