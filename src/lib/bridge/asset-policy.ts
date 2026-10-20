import type { Actor } from "./rbac.ts";
import type { TitleStatus } from "./types.ts";

export type TitleAccessContext = {
  id: string;
  ownerUserId: string;
  status: TitleStatus;
};

export type AssetAccessDecision = {
  allow: boolean;
  reason: string;
};

export type AssetPermissions = {
  canView: boolean;
  canPreview: boolean;
  canDownload: boolean;
  canUpload: boolean;
  canReplace: boolean;
  canDelete: boolean;
};

const UPLOADABLE_STATUSES: ReadonlySet<TitleStatus> = new Set(["DRAFT", "UPLOADING", "PREPARING"]);

/**
 * Determines whether an actor is authorized to see an asset in the asset list and UI.
 *
 * Rules:
 * - Super Admin & Admin: can view all assets.
 * - Title Owner / Studio: can view all assets on their own titles.
 * - QC Reviewer: can view all reviewable assets (master, screener, artwork, subtitles, technical, certificate).
 * - Legal Reviewer: restricted access. Cannot view master or technical packages. Can view censor certificate, subtitle, screener, artwork.
 * - Buyer: never views master, technical, or censor certificate. Entitled buyers see approved delivery assets (screener, subtitle, artwork). Non-entitled buyers see only public promotional artwork and public screener.
 * - Viewer, Investor, Finance: no media asset access by default.
 */
export function assetVisibilityDecision(
  actor: Actor,
  title: TitleAccessContext,
  kind: string,
  hasLicenseEntitlement = false,
): AssetAccessDecision {
  if (!actor.emailVerified) {
    return { allow: false, reason: "Email verification required" };
  }

  // Super Admin and Admin can view all catalog assets
  if (actor.internalRole === "super_admin" || actor.internalRole === "admin") {
    return { allow: true, reason: "Staff administration" };
  }

  // Title owner (independent creator or studio) on their own title
  if (title.ownerUserId === actor.userId && !actor.internalRole) {
    return { allow: true, reason: "Title owner" };
  }

  // QC Reviewer has authorized QC access across reviewable assets
  if (actor.internalRole === "qc_reviewer") {
    return { allow: true, reason: "QC review access" };
  }

  // Legal / Rights Reviewer has restricted access:
  // Can view censor certificate, subtitle, screener/trailer, and artwork.
  // Main film (master) and technical packages are restricted.
  if (actor.internalRole === "legal_reviewer") {
    if (kind === "master" || kind === "technical") {
      return { allow: false, reason: "Main film and technical assets are restricted for legal reviewers" };
    }
    return { allow: true, reason: "Legal and rights review access" };
  }

  // Buyer:
  // Never allowed to view master, technical, or censor certificate
  if (actor.accountType === "buyer" && !actor.internalRole) {
    if (kind === "master" || kind === "technical" || kind === "censor_certificate") {
      return { allow: false, reason: "Asset kind is not accessible to buyers" };
    }
    // Entitled buyers see approved delivery assets
    if (hasLicenseEntitlement) {
      return { allow: true, reason: "Licensed buyer entitlement covers approved delivery assets" };
    }
    // Non-entitled buyers only see promotional artwork and public screener
    if (["poster", "poster_vertical", "poster_horizontal", "thumbnail", "screener"].includes(kind)) {
      return { allow: true, reason: "Public promotional asset" };
    }
    return { allow: false, reason: "License entitlement required to view this asset" };
  }

  // Other internal roles (viewer, finance) and external roles (investor) have no asset access by default
  return { allow: false, reason: "Role does not have permission to view title assets" };
}

/**
 * Determines whether an actor is authorized to request a secure inline preview.
 *
 * Rules:
 * - Super Admin & Admin: can preview all visible assets.
 * - Title Owner: can preview all visible assets on their own title.
 * - QC Reviewer: can preview master (secure video preview), screener, artwork, subtitle, certificate.
 * - Legal Reviewer: can preview certificate, subtitle, screener, artwork (cannot preview master/technical).
 * - Buyer: entitled buyers can preview screener, subtitle, artwork. Non-entitled buyers can preview artwork and public screener.
 * - Viewer, Investor, Finance: cannot preview.
 */
export function assetPreviewDecision(
  actor: Actor,
  title: TitleAccessContext,
  kind: string,
  hasLicenseEntitlement = false,
): AssetAccessDecision {
  const vis = assetVisibilityDecision(actor, title, kind, hasLicenseEntitlement);
  if (!vis.allow) return vis;

  // Super Admin and Admin
  if (actor.internalRole === "super_admin" || actor.internalRole === "admin") {
    return { allow: true, reason: "Staff administration preview" };
  }

  // Title Owner
  if (title.ownerUserId === actor.userId && !actor.internalRole) {
    return { allow: true, reason: "Title owner preview" };
  }

  // QC Reviewer:
  // Gets secure video preview for master and screener, inline preview for artwork, subtitle, certificate
  if (actor.internalRole === "qc_reviewer") {
    return { allow: true, reason: "Authorized QC review preview" };
  }

  // Legal Reviewer:
  // Previews certificate, subtitle, screener, artwork
  if (actor.internalRole === "legal_reviewer") {
    return { allow: true, reason: "Authorized legal review preview" };
  }

  // Buyer:
  if (actor.accountType === "buyer" && !actor.internalRole) {
    if (hasLicenseEntitlement) {
      return { allow: true, reason: "Licensed buyer preview" };
    }
    if (["poster", "poster_vertical", "poster_horizontal", "thumbnail", "screener"].includes(kind)) {
      return { allow: true, reason: "Public promotional preview" };
    }
    return { allow: false, reason: "License entitlement required for preview" };
  }

  return { allow: false, reason: "Preview not authorized for this role" };
}

/**
 * Determines whether an actor is authorized to download raw asset files.
 *
 * Rules:
 * - Master:
 *   - Super Admin: YES.
 *   - Title Owner (own title): YES.
 *   - QC Reviewer: NO (review includes secure preview only; full master download is restricted).
 *   - Legal Reviewer: NO.
 *   - Buyer: NO.
 * - Technical Package:
 *   - Super Admin, Admin, Owner (own title), QC Reviewer: YES.
 *   - Others: NO.
 * - Censor Certificate:
 *   - Super Admin, Admin, Owner, QC Reviewer, Legal Reviewer: YES.
 *   - Buyer, Viewer, Investor: NO.
 * - Screener / Subtitle:
 *   - Super Admin, Admin, Owner, QC Reviewer, Legal Reviewer: YES.
 *   - Buyer: YES if hasLicenseEntitlement is true, else NO.
 * - Artwork:
 *   - Super Admin, Admin, Owner, QC Reviewer, Legal Reviewer, Buyer: YES.
 */
export function assetDownloadDecision(
  actor: Actor,
  title: TitleAccessContext,
  kind: string,
  hasLicenseEntitlement = false,
): AssetAccessDecision {
  const vis = assetVisibilityDecision(actor, title, kind, hasLicenseEntitlement);
  if (!vis.allow) return vis;

  // Master:
  // Full-master downloads require separate authorization.
  // Super Admin and Title Owner are allowed full master download.
  // QC Reviewer gets secure video preview only; raw master download is restricted.
  if (kind === "master") {
    if (actor.internalRole === "super_admin") {
      return { allow: true, reason: "Super administrator master download" };
    }
    if (title.ownerUserId === actor.userId && !actor.internalRole) {
      return { allow: true, reason: "Title owner master download" };
    }
    if (actor.internalRole === "qc_reviewer") {
      return { allow: false, reason: "QC review includes secure preview only; raw master download is restricted" };
    }
    return { allow: false, reason: "A screener or catalog grant does not authorize a master download" };
  }

  // Technical package:
  if (kind === "technical") {
    if (
      actor.internalRole === "super_admin" ||
      actor.internalRole === "admin" ||
      actor.internalRole === "qc_reviewer"
    ) {
      return { allow: true, reason: "Authorized technical package download" };
    }
    if (title.ownerUserId === actor.userId && !actor.internalRole) {
      return { allow: true, reason: "Title owner technical package download" };
    }
    return { allow: false, reason: "A screener or catalog grant does not authorize technical package downloads" };
  }

  // Censor Certificate:
  if (kind === "censor_certificate") {
    if (
      actor.internalRole === "super_admin" ||
      actor.internalRole === "admin" ||
      actor.internalRole === "qc_reviewer" ||
      actor.internalRole === "legal_reviewer"
    ) {
      return { allow: true, reason: "Staff review document download" };
    }
    if (title.ownerUserId === actor.userId && !actor.internalRole) {
      return { allow: true, reason: "Title owner document download" };
    }
    return { allow: false, reason: "Censor certificate download is restricted to staff reviewers and owners" };
  }

  // Screener and Subtitle:
  if (kind === "screener" || kind === "subtitle") {
    if (
      actor.internalRole === "super_admin" ||
      actor.internalRole === "admin" ||
      actor.internalRole === "qc_reviewer" ||
      actor.internalRole === "legal_reviewer"
    ) {
      return { allow: true, reason: "Staff review download" };
    }
    if (title.ownerUserId === actor.userId && !actor.internalRole) {
      return { allow: true, reason: "Title owner download" };
    }
    if (actor.accountType === "buyer" && !actor.internalRole) {
      if (hasLicenseEntitlement) {
        return { allow: true, reason: "Entitlement covers this non-master asset" };
      }
      return { allow: false, reason: "License entitlement required" };
    }
    return { allow: false, reason: "Download not authorized" };
  }

  // Artwork (poster, poster_vertical, poster_horizontal, thumbnail):
  if (["poster", "poster_vertical", "poster_horizontal", "thumbnail"].includes(kind)) {
    if (
      actor.internalRole === "super_admin" ||
      actor.internalRole === "admin" ||
      actor.internalRole === "qc_reviewer" ||
      actor.internalRole === "legal_reviewer" ||
      (title.ownerUserId === actor.userId && !actor.internalRole) ||
      (actor.accountType === "buyer" && !actor.internalRole)
    ) {
      return { allow: true, reason: "Poster is readable with the title" };
    }
  }

  return { allow: false, reason: "Download not authorized for this role" };
}

/**
 * Determines whether an actor is authorized to upload an asset.
 *
 * Rules:
 * - Workflow lifecycle check: upload is allowed ONLY when title status is DRAFT, UPLOADING, or PREPARING.
 *   Once title moves to QC_REVIEW or beyond, uploads are locked.
 * - Role check:
 *   - Super Admin: YES when workflow allows.
 *   - Title Owner (independent creator or studio on own title): YES when workflow allows.
 *   - QC, Legal, Viewer, Finance, Buyer, Investor: NO by default.
 */
export function assetUploadDecision(
  actor: Actor,
  title: TitleAccessContext,
  kind: string,
): AssetAccessDecision {
  if (!actor.emailVerified) {
    return { allow: false, reason: "Email verification required" };
  }

  if (!UPLOADABLE_STATUSES.has(title.status)) {
    return { allow: false, reason: `Uploads are closed for this status (${title.status})` };
  }

  if (actor.internalRole === "super_admin") {
    return { allow: true, reason: "Super administrator internal ingest" };
  }

  if (title.ownerUserId === actor.userId && !actor.internalRole) {
    if (actor.accountType === "independent_creator" || actor.accountType === "studio") {
      return { allow: true, reason: "Title owner upload" };
    }
  }

  return { allow: false, reason: "Upload and replace are restricted to title owners and super administrators" };
}

export function assetReplaceDecision(
  actor: Actor,
  title: TitleAccessContext,
  kind: string,
): AssetAccessDecision {
  return assetUploadDecision(actor, title, kind);
}

export function assetDeleteDecision(
  actor: Actor,
  title: TitleAccessContext,
  kind: string,
): AssetAccessDecision {
  if (!actor.emailVerified) {
    return { allow: false, reason: "Email verification required" };
  }
  if (!UPLOADABLE_STATUSES.has(title.status)) {
    return { allow: false, reason: `Asset deletion is closed for this status (${title.status})` };
  }
  if (actor.internalRole === "super_admin") {
    return { allow: true, reason: "Super administrator delete" };
  }
  if (title.ownerUserId === actor.userId && !actor.internalRole) {
    return { allow: true, reason: "Title owner delete" };
  }
  return { allow: false, reason: "Asset deletion is restricted to title owners and super administrators" };
}

export function getAssetPermissions(
  actor: Actor,
  title: TitleAccessContext,
  kind: string,
  hasLicenseEntitlement = false,
): AssetPermissions {
  return {
    canView: assetVisibilityDecision(actor, title, kind, hasLicenseEntitlement).allow,
    canPreview: assetPreviewDecision(actor, title, kind, hasLicenseEntitlement).allow,
    canDownload: assetDownloadDecision(actor, title, kind, hasLicenseEntitlement).allow,
    canUpload: assetUploadDecision(actor, title, kind).allow,
    canReplace: assetReplaceDecision(actor, title, kind).allow,
    canDelete: assetDeleteDecision(actor, title, kind).allow,
  };
}
