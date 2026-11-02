export type DownloadDecision = { allow: boolean; reason: string };

export function matchesBuyerEntitlementScope(input: {
  actorUserId: string;
  actorOrganizationId: string | null | undefined;
  titleId: string;
  entitlementUserId: string | null | undefined;
  entitlementOrganizationId: string | null | undefined;
  entitlementTitleId: string | null | undefined;
}): boolean {
  return Boolean(
    input.actorUserId &&
    input.actorOrganizationId &&
    input.titleId &&
    input.entitlementUserId &&
    input.entitlementOrganizationId &&
    input.entitlementTitleId &&
    input.actorUserId === input.entitlementUserId &&
    input.actorOrganizationId === input.entitlementOrganizationId &&
    input.titleId === input.entitlementTitleId
  );
}

/**
 * A buyer catalog or screener grant never authorizes a source master.
 * Title owners and explicitly privileged Admin / Super Admin staff may download
 * a master. QC / Legal reviewers are always denied by default; no exception
 * path exists in this policy. Buyer access requires a separately scoped grant.
 */
export function downloadDecision(opts: {
  kind: string;
  actorIsOwner: boolean;
  actorIsInternal: boolean;
  actorInternalRole?: string | null;
  accountType: string;
  hasLicenseEntitlement: boolean;
}): DownloadDecision {
  if (opts.kind === "master") {
    const reviewerDenied = opts.actorInternalRole === "qc_reviewer" || opts.actorInternalRole === "legal_reviewer";
    const privilegedStaff = opts.actorInternalRole === "admin" || opts.actorInternalRole === "super_admin";
    if (reviewerDenied || (!opts.actorIsOwner && !privilegedStaff)) {
      return {
        allow: false,
        reason: "Master downloads are denied to QC / Legal reviewers and require title ownership or Admin approval",
      };
    }
    return { allow: true, reason: "Master download allowed for the title owner or Admin / Super Admin" };
  }
  if (opts.kind === "technical") {
    if (!opts.actorIsOwner && !opts.actorIsInternal) {
      return {
        allow: false,
        reason: "A screener or catalog grant does not authorize technical package downloads",
      };
    }
    return { allow: true, reason: "Technical package downloads are limited to the title owner or an internal reviewer" };
  }
  if (opts.actorIsOwner || opts.actorIsInternal) {
    return { allow: true, reason: "Owner or internal reviewer" };
  }
  if (opts.kind === "poster") return { allow: true, reason: "Poster is readable with the title" };
  if ((opts.kind === "screener" || opts.kind === "subtitle") && opts.hasLicenseEntitlement) {
    return { allow: true, reason: "Entitlement covers this non-master asset" };
  }
  return { allow: false, reason: "License entitlement required" };
}
