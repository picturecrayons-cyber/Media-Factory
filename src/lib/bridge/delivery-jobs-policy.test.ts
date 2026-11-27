import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertVendorJobsSuperAdmin } from "./delivery-jobs-policy.ts";

describe("Vendor Jobs authorization", () => {
  it("rejects Studio, Creator, Buyer and non-Super-Admin staff before a write can run", () => {
    const roles = ["studio_owner", "creator", "buyer", "admin", "legal_reviewer", null];
    for (const internalRole of roles) {
      let writes = 0;
      assert.throws(
        () => {
          assertVendorJobsSuperAdmin({ emailVerified: true, internalRole });
          writes += 1;
        },
        /Only the verified Bridge Super Admin/,
      );
      assert.equal(writes, 0, `no writes for role ${String(internalRole)}`);
    }
  });

  it("rejects an unverified Super Admin before a write can run", () => {
    let writes = 0;
    assert.throws(
      () => {
        assertVendorJobsSuperAdmin({ emailVerified: false, internalRole: "super_admin" });
        writes += 1;
      },
      /Only the verified Bridge Super Admin/,
    );
    assert.equal(writes, 0);
  });

  it("allows only a verified Super Admin", () => {
    assert.doesNotThrow(() =>
      assertVendorJobsSuperAdmin({ emailVerified: true, internalRole: "super_admin" }),
    );
  });
});
