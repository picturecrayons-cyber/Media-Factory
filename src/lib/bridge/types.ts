export const ACCOUNT_TYPES = ["independent_creator", "studio", "buyer"] as const;
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
  organizationId: string | null;
  ownerAccountType: AccountType;
  status: TitleStatus;
  synopsis: string;
  language: string;
  year: number | null;
  runtimeMinutes: number | null;
  licensingFeePaise: number;
  posterKey: string | null;
  masterKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export const ASSET_KINDS = ["poster", "screener", "master", "subtitle", "playback", "trailer"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const PERMISSIONS = [
  "title.create",
  "title.read_own",
  "title.read_catalog",
  "title.update_own",
  "title.advance_upload",
  "title.qc_review",
  "title.rights_review",
  "title.license",
  "title.negotiate",
  "title.deliver",
  "title.reverse",
  "asset.sign_upload",
  "asset.sign_download",
  "payment.create_order",
  "entitlement.read_own",
  "finance.read",
  "users.invite_internal",
  "audit.read",
  "directory.read",
  "integrations.read",
  "partner.invite",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
