export type DownloadDecision = { allow: boolean; reason: string };

/**
 * A buyer catalog or screener grant never authorizes a source master.
 * Owners may download their own master. Internal master access is role-scoped:
 * QC and Legal reviewers are denied by default; Admin roles remain permitted.
 */
export function downloadDecision(opts: {
  kind: string;
  actorIsOwner: boolean;
  actorIsInternal: boolean;
  accountType: string;
  hasLicenseEntitlement: boolean;
  actorInternalRole?: string | null;
}): DownloadDecision {
  if (opts.kind === "master") {
    if (opts.actorInternalRole === "qc_reviewer" || opts.actorInternalRole === "legal_reviewer") {
      return {
        allow: false,
        reason: "QC and Legal master downloads are denied by default; a separately approved exception is required",
      };
    }
    if (!opts.actorIsOwner && !opts.actorIsInternal) {
      return {
        allow: false,
        reason: "A screener or catalog grant does not authorize a master download",
      };
    }
    return { allow: true, reason: "Master download is limited to the title owner or an authorized internal admin" };
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
