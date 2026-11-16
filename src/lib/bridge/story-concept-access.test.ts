import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { storyConceptOrganizationScope, storyConceptOwnerUserScope } from "./story-concept-access.ts";

describe("Story/Concept organization read scope", () => {
  const sharedOrganizationId = "11111111-1111-4111-8111-111111111111";

  it("does not grant a Buyer Studio workspace scope in the same organization", () => {
    assert.equal(
      storyConceptOrganizationScope({
        accountType: "buyer",
        organizationId: sharedOrganizationId,
      }),
      null,
    );
  });

  it("does not grant a Buyer Studio workspace scope across organizations", () => {
    assert.equal(
      storyConceptOrganizationScope({
        accountType: "buyer",
        organizationId: "22222222-2222-4222-8222-222222222222",
      }),
      null,
    );
  });

  it("does not grant a Buyer Studio workspace scope through an internal role", () => {
    // Internal role is deliberately not an input to this commercial workspace gate.
    assert.equal(
      storyConceptOrganizationScope({
        accountType: "buyer",
        organizationId: sharedOrganizationId,
      }),
      null,
    );
  });

  it("allows an active, server-resolved Studio membership to scope its own organization", () => {
    assert.equal(
      storyConceptOrganizationScope({
        accountType: "studio",
        organizationId: sharedOrganizationId,
      }),
      sharedOrganizationId,
    );
  });

  it("fails closed for a Studio without a resolved organization", () => {
    assert.equal(
      storyConceptOrganizationScope({ accountType: "studio", organizationId: null }),
      null,
    );
  });

  it("does not grant organization scope to independent creators or internal staff accounts", () => {
    for (const accountType of ["independent_creator", "investor"]) {
      assert.equal(
        storyConceptOrganizationScope({ accountType, organizationId: sharedOrganizationId }),
        null,
      );
    }
  });
  it("does not expose even directly owned Story/Concept rows to Buyer or Investor accounts", () => {
    for (const accountType of ["buyer", "investor"]) {
      assert.equal(
        storyConceptOwnerUserScope({ accountType, userId: "buyer-user" }),
        null,
      );
    }
  });

  it("keeps direct owner scope for independent creators and Studio members", () => {
    for (const accountType of ["independent_creator", "studio"]) {
      assert.equal(
        storyConceptOwnerUserScope({ accountType, userId: "creator-user" }),
        "creator-user",
      );
    }
  });

});
