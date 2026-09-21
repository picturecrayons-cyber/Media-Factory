import type { AccountType, InternalRole, Permission, TitleStatus } from "./types.ts";
import { isBuyerVisible } from "./lifecycle.ts";

const INTERNAL_PERMISSIONS: Record<InternalRole, readonly Permission[]> = {
  viewer: ["title.read_catalog", "audit.read", "directory.read", "integrations.read"],
  qc_reviewer: ["title.read_catalog", "title.qc_review", "asset.sign_download", "audit.read", "directory.read", "integrations.read"],
  legal_reviewer: ["title.read_catalog", "title.rights_review", "asset.sign_download", "audit.read", "directory.read", "integrations.read"],
  finance: ["title.read_catalog", "finance.read", "entitlement.read_own", "audit.read", "directory.read", "integrations.read"],
  admin: [
    "title.read_catalog",
    "title.qc_review",
    "title.rights_review",
    "title.license",
    "title.negotiate",
    "title.deliver",
    "title.reverse",
    "asset.sign_download",
    "finance.read",
    "users.invite_internal",
    "audit.read",
    "directory.read",
    "integrations.read",
    "partner.invite",
  ],
  super_admin: [
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
  ],
};

const ACCOUNT_PERMISSIONS: Record<AccountType, readonly Permission[]> = {
  independent_creator: [
    "title.create",
    "title.read_own",
    "title.update_own",
    "title.advance_upload",
    "asset.sign_upload",
    "asset.sign_download",
    "entitlement.read_own",
  ],
  studio: [
    "title.create",
    "title.read_own",
    "title.update_own",
    "title.advance_upload",
    "asset.sign_upload",
    "asset.sign_download",
    "entitlement.read_own",
  ],
  buyer: ["title.read_catalog", "payment.create_order", "entitlement.read_own", "asset.sign_download"],
};

export type Actor = {
  userId: string;
  emailVerified: boolean;
  accountType: AccountType;
  internalRole: InternalRole | null;
  organizationId?: string | null;
};

const TRANSITION_PERMISSION: Record<string, Permission> = {
  "DRAFT->UPLOADING": "title.advance_upload",
  "UPLOADING->PREPARING": "title.advance_upload",
  "PREPARING->QC_REVIEW": "title.advance_upload",
  "QC_REVIEW->RIGHTS_REVIEW": "title.qc_review",
  "RIGHTS_REVIEW->LICENSING_READY": "title.rights_review",
  "LICENSING_READY->LIVE_FOR_BUYERS": "title.license",
  "LIVE_FOR_BUYERS->IN_NEGOTIATION": "title.negotiate",
  "LICENSED->DELIVERED": "title.deliver",
};

export function permissionForTransition(from: TitleStatus, to: TitleStatus): Permission | null {
  return TRANSITION_PERMISSION[`${from}->${to}`] ?? null;
}

export function permissionsFor(actor: Actor): Set<Permission> {
  const set = new Set<Permission>(ACCOUNT_PERMISSIONS[actor.accountType]);
  if (actor.internalRole) {
    for (const p of INTERNAL_PERMISSIONS[actor.internalRole]) set.add(p);
  }
  return set;
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  if (!actor.emailVerified) return false;
  return permissionsFor(actor).has(permission);
}

export function assertPermission(actor: Actor, permission: Permission): void {
  if (!actor.emailVerified) throw new Error("Email verification required");
  if (!hasPermission(actor, permission)) {
    throw new Error("Forbidden");
  }
}

export function canReadTitle(
  actor: Actor,
  title: { ownerUserId: string; status: TitleStatus; organizationId?: string | null },
): boolean {
  if (!actor.emailVerified) return false;
  if (title.ownerUserId === actor.userId) return hasPermission(actor, "title.read_own");
  if (
    title.organizationId &&
    actor.organizationId &&
    title.organizationId === actor.organizationId
  ) {
    return hasPermission(actor, "title.read_own");
  }
  if (actor.internalRole) return hasPermission(actor, "title.read_catalog");
  if (actor.accountType === "buyer") {
    return hasPermission(actor, "title.read_catalog") && isBuyerVisible(title.status);
  }
  return false;
}

export function workspaceHome(actor: Actor): string {
  if (actor.internalRole) return "/internal";
  if (actor.accountType === "buyer") return "/buyer";
  if (actor.accountType === "studio") return "/studio";
  return "/creator";
}
