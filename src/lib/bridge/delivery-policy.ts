export type DownloadDecision = { allow: boolean; reason: string };

/**
 * A buyer catalog or screener grant never authorizes a source master.
 * Buyer account type is a hard boundary: an internalRole flag must not turn
 * a Buyer account into staff for master, technical, or censor-certificate files.
 */
export function downloadDecision(opts: {
  kind: string;
  actorIsOwner: boolean;
  actorIsInternal: boolean;
  accountType: string;
  hasLicenseEntitlement: boolean;
}): DownloadDecision {
  if (
    opts.accountType === "buyer" &&
    ["master", "technical", "censor_certificate"].includes(opts.kind)
  ) {
    return {
      allow: false,
      reason: "Buyer accounts cannot download master, technical, or censor-certificate assets",
    };
  }
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
  if ((opts.kind === "screener" || opts.kind === "subtitle") && opts.hasLicenseEntitlement) {
    return { allow: true, reason: "Entitlement covers this non-master asset" };
  }
  return { allow: false, reason: "License entitlement required" };
}
