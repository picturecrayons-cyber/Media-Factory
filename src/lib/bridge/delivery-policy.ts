export type DownloadDecision = { allow: boolean; reason: string };

/**
 * A buyer catalog or screener grant never authorizes a source master.
 * Owners and internal reviewers may download a master. Everyone else needs
 * an entitlement, and that entitlement only covers screener or subtitle files.
 */
export function downloadDecision(opts: {
  kind: string;
  actorIsOwner: boolean;
  actorIsInternal: boolean;
  accountType: string;
  hasLicenseEntitlement: boolean;
  hasPrivateScreeningGrant?: boolean;
}): DownloadDecision {
  if (opts.kind === "master") {
    if (!opts.actorIsOwner && !opts.actorIsInternal) {
      return {
        allow: false,
        reason: "A screener or catalog grant does not authorize a master download",
      };
    }
    return { allow: true, reason: "Master download is limited to the title owner or an internal reviewer" };
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
  if (opts.kind === "screener" && (opts.hasLicenseEntitlement || opts.hasPrivateScreeningGrant === true)) {
    return { allow: true, reason: opts.hasPrivateScreeningGrant ? "Active private screening grant" : "License entitlement covers screener" };
  }
  if (opts.kind === "subtitle" && opts.hasLicenseEntitlement) {
    return { allow: true, reason: "License entitlement covers subtitle asset" };
  }
  return { allow: false, reason: "License entitlement required" };
}
