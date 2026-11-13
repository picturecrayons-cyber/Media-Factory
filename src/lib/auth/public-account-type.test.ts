import test from "node:test";
import assert from "node:assert/strict";
import { publicAccountTypeFrom } from "./public-account-type.ts";

test("maps supported public roles and creator CTA alias", () => {
  assert.equal(publicAccountTypeFrom("creator"), "independent_creator");
  assert.equal(publicAccountTypeFrom("independent_creator"), "independent_creator");
  assert.equal(publicAccountTypeFrom("studio"), "studio");
  assert.equal(publicAccountTypeFrom("buyer"), "buyer");
  assert.equal(publicAccountTypeFrom("investor"), "investor");
});

test("does not silently map internal or unknown roles to a public account type", () => {
  assert.equal(publicAccountTypeFrom("super_admin"), null);
  assert.equal(publicAccountTypeFrom(undefined), null);
});
