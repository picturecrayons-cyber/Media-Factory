export const ACCOUNT_TYPES = ["independent_creator", "studio", "buyer", "investor"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const INTERNAL_ROLES = [
  "admin",
  "super_admin",
  "qc_reviewer",
  "legal_reviewer",
  "finance",
  "viewer",
] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

export const TITLE_STATUSES = [
  "DRAFT",
  "UPLOADING",
  "PREPARING",
  "QC_REVIEW",
  "RIGHTS_REVIEW",
  "LICENSING_READY",
  "LIVE_FOR_BUYERS",
  "IN_NEGOTIATION",
  "LICENSED",
  "DELIVERED",
] as const;
export type TitleStatus = (typeof TITLE_STATUSES)[number];

export type BridgeProfile = {
  userId: string;
  email: string;
  displayName: string;
  accountType: AccountType;
  organizationName: string | null;
  internalRole: InternalRole | null;
  emailVerified: boolean;
};

export type BridgeTitle = {
  id: string;
  slug: string;
  name: string;
  nameMl: string | null;
  ownerUserId: string;
  ownerAccountType: AccountType;
  status: TitleStatus;
  synopsis: string;
  language: string;
  year: number | null;
  runtimeMinutes: number | null;
  licensingFeePaise: number;
  posterKey: string | null;
  masterKey: string | null;
  contentType: string;
  countryOfOrigin: string | null;
  releaseDate: string | null;
  credits: Array<{ role: string; name: string }>;
  createdAt: string;
  updatedAt: string;
};

export const ASSET_KINDS = [
  "poster",
  "poster_vertical",
  "poster_horizontal",
  "thumbnail",
  "screener",
  "master",
  "subtitle",
  "technical",
  "censor_certificate",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

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

export const PERMISSIONS = [
  "title.ingest_internal",
  "title.create",
  "title.read_own",
  "title.read_catalog",
  "title.update_own",
  "title.merge_duplicate",
  "title.advance_upload",
  "title.qc_review",
  "title.rights_review",
  "title.license",
  "title.negotiate",
  "title.deliver",
  "asset.sign_upload",
  "asset.sign_download",
  "payment.create_order",
  "service.quote_create",
  "service.order_create",
  "service.fulfill",
  "entitlement.read_own",
  "finance.read",
  "finance.configure",
  "finance.record_settlement",
  "delivery.read",
  "delivery.read_finance",
  "users.invite_internal",
  "audit.read",
  "loop.publish",
  "loop.revoke",
  "loop.certify_playback",
  "storage.read",
  "storage.recommend",
  "storage.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
