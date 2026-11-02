import { hasPermission, canOperateOnTitle, type Actor } from "./rbac.ts";

export type VendorTitleScope = {
  ownerUserId: string;
  ownerAccountType: "independent_creator" | "studio" | "buyer" | "investor";
  ownerOrganizationId: string | null;
};

export type VendorJobAction = "start_work" | "submit_review" | "sign_off" | "block";

export function canRequestVendorJob(actor: Actor, title: VendorTitleScope): boolean {
  if (!actor.emailVerified) return false;
  if (actor.internalRole) {
    return Boolean(
      actor.organizationId &&
      title.ownerOrganizationId &&
      actor.organizationId === title.ownerOrganizationId &&
      hasPermission(actor, "title.deliver"),
    );
  }
  return canOperateOnTitle(actor, title, "title.create");
}

/** Internal vendor operations require an explicit delivery permission and exact organization match. */
export function canOperateVendorJob(actor: Actor, organizationId: string | null): boolean {
  return Boolean(
    actor.emailVerified &&
    actor.internalRole &&
    actor.organizationId &&
    organizationId &&
    actor.organizationId === organizationId &&
    hasPermission(actor, "title.deliver"),
  );
}

export function nextVendorJobState(current: string, action: VendorJobAction): string | null {
  if (action === "start_work" && current === "assigned") return "in_progress";
  if (action === "submit_review" && current === "in_progress") return "in_review";
  if (action === "sign_off" && current === "in_review") return "signed_off";
  if (action === "block" && ["requested", "assigned", "in_progress", "in_review"].includes(current)) return "blocked";
  return null;
}

export function canSignOffVendorJob(requestedBy: string, reviewerId: string): boolean {
  return Boolean(requestedBy && reviewerId && requestedBy !== reviewerId);
}
