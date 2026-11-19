import test from "node:test";
import assert from "node:assert/strict";
import {
  canCreateOwnershipClaim,
  canTriageOwnershipClaim,
  canLegallyReviewOwnershipClaim,
  canReadOwnershipClaim,
  canListCreatorAssetsForTitle,
  canReadOriginalTitleAssets,
} from "./ownership-claims-policy.ts";
import type { Actor } from "./rbac.ts";

const makeActor = (
  userId: string,
  accountType: Actor["accountType"] = "independent_creator",
  internalRole: Actor["internalRole"] = null,
  emailVerified = true,
): Actor => ({ userId, accountType, internalRole, emailVerified });

const creator = makeActor("producer-profile");
const foreignTitle = { ownerUserId: "historical-owner", status: "RIGHTS_REVIEW" as const };
const claim = { claimantUserId: "producer-profile", status: "SUBMITTED" };

test("only verified independent Creator accounts can start claims", () => {
  assert.equal(canCreateOwnershipClaim(creator), true);
  assert.equal(canCreateOwnershipClaim(makeActor("buyer", "buyer")), false);
  assert.equal(canCreateOwnershipClaim(makeActor("staff", "independent_creator", "admin")), false);
  assert.equal(canCreateOwnershipClaim(makeActor("unverified", "independent_creator", null, false)), false);
});

test("Super Admin intake and Legal review remain separate roles", () => {
  const superAdmin = makeActor("super", "independent_creator", "super_admin");
  const legal = makeActor("legal", "independent_creator", "legal_reviewer");
  assert.equal(canTriageOwnershipClaim(superAdmin), true);
  assert.equal(canTriageOwnershipClaim(legal), false);
  assert.equal(canLegallyReviewOwnershipClaim(legal), true);
  assert.equal(canLegallyReviewOwnershipClaim(superAdmin), false);
  assert.equal(canLegallyReviewOwnershipClaim(makeActor("unverified-legal", "independent_creator", "legal_reviewer", false)), false);
});

test("claim evidence is visible only to the claimant, Super Admin or Legal Reviewer", () => {
  assert.equal(canReadOwnershipClaim(creator, claim), true);
  assert.equal(canReadOwnershipClaim(makeActor("other-creator"), claim), false);
  assert.equal(canReadOwnershipClaim(makeActor("super", "independent_creator", "super_admin"), claim), true);
  assert.equal(canReadOwnershipClaim(makeActor("legal", "independent_creator", "legal_reviewer"), claim), true);
  assert.equal(canReadOwnershipClaim(makeActor("admin", "independent_creator", "admin"), claim), false);
});

test("a claim never grants access to original title assets owned by another account", () => {
  assert.equal(canListCreatorAssetsForTitle(creator, foreignTitle), false);
  assert.equal(canReadOriginalTitleAssets(creator, foreignTitle), false);
  assert.equal(canListCreatorAssetsForTitle(creator, { ...foreignTitle, ownerUserId: creator.userId }), true);
});
