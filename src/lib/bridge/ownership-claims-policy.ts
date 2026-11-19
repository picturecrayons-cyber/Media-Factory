import type { Actor } from "./rbac.ts";
import { canReadTitle } from "./rbac.ts";

export type ClaimVisibility = {
  claimantUserId: string;
  status: string;
};

export type ClaimTitleScope = {
  ownerUserId: string;
  status: "DRAFT" | "UPLOADING" | "PREPARING" | "QC_REVIEW" | "RIGHTS_REVIEW" | "LICENSING_READY" | "LIVE_FOR_BUYERS" | "IN_NEGOTIATION" | "LICENSED" | "DELIVERED";
};

/** Claims are initiated only by verified, non-staff independent Creator accounts. */
export function canCreateOwnershipClaim(actor: Actor): boolean {
  return actor.emailVerified && actor.accountType === "independent_creator" && actor.internalRole === null;
}

/** Super Admin handles intake and routing, never the independent Legal decision. */
export function canTriageOwnershipClaim(actor: Actor): boolean {
  return actor.emailVerified && actor.internalRole === "super_admin";
}

/** The Legal decision is a separate permission and cannot be made by Super Admin alone. */
export function canLegallyReviewOwnershipClaim(actor: Actor): boolean {
  return actor.emailVerified && actor.internalRole === "legal_reviewer";
}

/** A claim exposes its evidence only to the claimant and designated review roles. */
export function canReadOwnershipClaim(actor: Actor, claim: ClaimVisibility): boolean {
  if (!actor.emailVerified) return false;
  if (actor.internalRole === "super_admin" || actor.internalRole === "legal_reviewer") return true;
  return actor.internalRole === null &&
    actor.accountType === "independent_creator" &&
    actor.userId === claim.claimantUserId;
}

/**
 * Creator asset listing remains strictly tied to canonical title ownership.
 * Claim records are deliberately not accepted as an alternate ownership proof.
 */
export function canListCreatorAssetsForTitle(actor: Actor, title: ClaimTitleScope): boolean {
  return actor.emailVerified &&
    actor.internalRole === null &&
    actor.accountType === "independent_creator" &&
    actor.userId === title.ownerUserId;
}

/** Existing title read permission is unchanged by an ownership claim. */
export function canReadOriginalTitleAssets(actor: Actor, title: ClaimTitleScope): boolean {
  return canReadTitle(actor, title);
}
