import type { AccountType, InternalRole, Permission, TitleStatus } from "./types.ts";

const INTERNAL_PERMISSIONS: Record<InternalRole, readonly Permission[]> = {
  viewer: ["title.read_catalog", "audit.read"],
  qc_reviewer: ["title.read_catalog", "title.qc_review", "asset.sign_download", "audit.read"],
  legal_reviewer: [
    "title.read_catalog",
    "title.rights_review",
    "asset.sign_download",
    "audit.read",
  ],
  finance: [
    "title.read_catalog",
    "finance.read",
    "finance.record_settlement",
    "entitlement.read_own",
    "audit.read",
  ],
  admin: [
    "title.read_catalog",
    "service.quote_create",
    "service.order_create",
    "service.fulfill",
    "title.qc_review",
    "title.rights_review",
    "title.license",
    "title.merge_duplicate",
    "title.negotiate",
    "title.deliver",
    "service.quote_create",
    "service.order_create",
    "service.fulfill",
    "delivery.read",
    "delivery.read_finance",
    "asset.sign_download",
    "finance.read",
    "finance.record_settlement",
    "users.invite_internal",
    "audit.read",
    "loop.publish",
    "loop.revoke",
    "loop.certify_playback",
  ],
  super_admin: [
    "title.ingest_internal",
    "title.create",
    "title.read_catalog",
    "title.advance_upload",
    "title.qc_review",
    "title.rights_review",
    "title.license",
    "title.negotiate",
    "title.deliver",
    "delivery.read",
    "delivery.read_finance",
    "asset.sign_download",
    "entitlement.read_own",
    "finance.read",
    "finance.record_settlement",
    "users.invite_internal",
    "audit.read",
    "loop.publish",
    "loop.revoke",
    "loop.certify_playback",
    "asset.sign_upload",
  ],
};

const ACCOUNT_PERMISSIONS: Record<AccountType, readonly Permission[]> = {
  independent_creator: [
    "title.create",
    "title.read_own",
    "title.update_own",
    "title.advance_upload",
    "service.quote_create",
    "service.order_create",
    "asset.sign_upload",
    "asset.sign_download",
    "entitlement.read_own",
    "delivery.read",
    "delivery.read_finance",
  ],
  studio: [
    "title.create",
    "title.read_own",
    "title.update_own",
    "title.advance_upload",
    "service.quote_create",
    "service.order_create",
    "asset.sign_upload",
    "asset.sign_download",
    "entitlement.read_own",
    "delivery.read",
    "delivery.read_finance",
  ],
  buyer: [
    "title.read_catalog",
    "payment.create_order",
    "entitlement.read_own",
    "asset.sign_download",
  ],
  investor: [
    "entitlement.read_own",
  ],
};

export type Actor = {
  userId: string;
  emailVerified: boolean;
  accountType: AccountType;
  internalRole: InternalRole | null;
};

const TRANSITION_PERMISSION: Record<string, Permission> = {
  "DRAFT->UPLOADING": "title.advance_upload",
  "UPLOADING->PREPARING": "title.advance_upload",
  "PREPARING->QC_REVIEW": "title.advance_upload",
  "QC_REVIEW->RIGHTS_REVIEW": "title.qc_review",
  "RIGHTS_REVIEW->LICENSING_READY": "title.rights_review",
  "LIVE_FOR_BUYERS->IN_NEGOTIATION": "title.negotiate",
  "LICENSED->DELIVERED": "title.deliver",
};

export function permissionForTransition(from: TitleStatus, to: TitleStatus): Permission | null {
  return TRANSITION_PERMISSION[`${from}->${to}`] ?? null;
}

export function permissionsFor(actor: Actor): Set<Permission> {
  // Internal staff identities are governed by their explicit staff role.
  // Account-type powers must never silently widen a staff role (for example,
  // a viewer profile whose account_type happens to be independent_creator).
  const staff = actor.internalRole ? INTERNAL_PERMISSIONS[actor.internalRole] : undefined;
  if (staff) return new Set<Permission>(staff);
  return new Set<Permission>(ACCOUNT_PERMISSIONS[actor.accountType] ?? []);
}

export function canAccessDashboard(actor: Actor): boolean {
  return actor.emailVerified && actor.internalRole === "super_admin";
}

const ROLE_GRANTS: Record<InternalRole, readonly InternalRole[]> = {
  viewer: [],
  qc_reviewer: [],
  legal_reviewer: [],
  finance: [],
  admin: ["viewer", "qc_reviewer", "legal_reviewer", "finance", "admin"],
  super_admin: ["viewer", "qc_reviewer", "legal_reviewer", "finance", "admin", "super_admin"],
};

export function canGrantInternalRole(actor: Actor, role: InternalRole): boolean {
  if (!actor.emailVerified || !actor.internalRole) return false;
  return ROLE_GRANTS[actor.internalRole].includes(role);
}

export function hasAccountPermission(actor: Actor, permission: Permission): boolean {
  return actor.emailVerified && !actor.internalRole && ACCOUNT_PERMISSIONS[actor.accountType].includes(permission);
}

export function hasStaffPermission(actor: Actor, permission: Permission): boolean {
  const staff = actor.internalRole ? INTERNAL_PERMISSIONS[actor.internalRole] : undefined;
  return actor.emailVerified && Boolean(staff) && staff!.includes(permission);
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  if (!actor.emailVerified) return false;
  return actor.internalRole
    ? hasStaffPermission(actor, permission)
    : hasAccountPermission(actor, permission);
}

export function assertPermission(actor: Actor, permission: Permission): void {
  if (!actor.emailVerified) throw new Error("Email verification required");
  if (!hasPermission(actor, permission)) {
    throw new Error("Forbidden");
  }
}

export function canReadTitle(
  actor: Actor,
  title: { ownerUserId: string; status: TitleStatus },
): boolean {
  if (!actor.emailVerified) return false;
  if (title.ownerUserId === actor.userId && !actor.internalRole)
    return hasPermission(actor, "title.read_own");
  if (actor.internalRole) return hasPermission(actor, "title.read_catalog");
  if (actor.accountType === "buyer") return ["LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED","DELIVERED"].includes(title.status) && hasPermission(actor, "title.read_catalog");
  return false;
}

export function canMutateTitle(
  actor: Actor,
  title: { ownerUserId: string },
  ownerPermission: Permission,
  staffPermission: Permission,
): boolean {
  if (!actor.emailVerified) return false;
  if (actor.internalRole) return hasPermission(actor, staffPermission);
  return title.ownerUserId === actor.userId && hasPermission(actor, ownerPermission);
}

export function canOperateOnTitle(
  actor: Actor,
  title: { ownerUserId: string },
  ownerPermission: Permission,
  staffPermission: Permission | null = null,
): boolean {
  if (!actor.emailVerified) return false;
  if (actor.internalRole) return staffPermission ? hasPermission(actor, staffPermission) : false;
  return title.ownerUserId === actor.userId && hasPermission(actor, ownerPermission);
}

export function workspaceHome(actor: Actor): string {
  // Resolve the post-auth destination from the server-backed Bridge profile.
  // Signup query parameters are intent only and never grant privileges.
  if (canAccessDashboard(actor)) return "/dashboard";
  if (actor.internalRole === "qc_reviewer") return "/internal?desk=qc";
  if (actor.internalRole) return "/internal";
  if (actor.accountType === "independent_creator") return "/creator";
  if (actor.accountType === "studio") return "/studio";
  if (actor.accountType === "buyer") return "/buyer";
  if (actor.accountType === "investor") return "/investor";
  return "/";
}
