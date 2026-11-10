export type DownloadDecision = { allow: boolean; reason: string };

/** Masters and technical packages are never authorized by preview grants. */
export function downloadDecision(opts: {
  kind: string;
  actorIsOwner: boolean;
  actorIsInternal: boolean;
  accountType: string;
  hasLicenseEntitlement: boolean;
  hasPrivateScreeningGrant?: boolean;
  hasInvestorPreviewGrant?: boolean;
}): DownloadDecision {
  if (opts.kind === "master") {
    if (!opts.actorIsOwner && !opts.actorIsInternal) return { allow: false, reason: "A screener or catalog grant does not authorize a master download" };
    return { allow: true, reason: "Master download is limited to the title owner or an internal reviewer" };
  }
  if (opts.kind === "technical") {
    if (!opts.actorIsOwner && !opts.actorIsInternal) return { allow: false, reason: "A screener or catalog grant does not authorize technical package downloads" };
    return { allow: true, reason: "Technical package downloads are limited to the title owner or an internal reviewer" };
  }
  if (opts.actorIsOwner || opts.actorIsInternal) return { allow: true, reason: "Owner or internal reviewer" };
  if (opts.kind === "poster") return { allow: true, reason: "Poster is readable with the title" };
  if (opts.kind === "screener" && (opts.hasLicenseEntitlement || opts.hasPrivateScreeningGrant === true || opts.hasInvestorPreviewGrant === true)) {
    return { allow: true, reason: opts.hasPrivateScreeningGrant ? "Active buyer private screening grant" : opts.hasInvestorPreviewGrant ? "Active investor private preview grant" : "License entitlement covers screener" };
  }
  if (opts.kind === "subtitle" && opts.hasLicenseEntitlement) return { allow: true, reason: "License entitlement covers subtitle asset" };
  return { allow: false, reason: "License entitlement or explicit preview grant required" };
}
