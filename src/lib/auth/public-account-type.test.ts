import test from "node:test";
import assert from "node:assert/strict";
import { publicAccountTypeFrom } from "./public-account-type.ts";

test("maps supported public roles and creator CTA alias", () => {
  assert.equal(publicAccountTypeFrom("creator"), "independent_creator");
  assert.equal(publicAccountTypeFrom("independent_creator"), "independent_creator");
  assert.equal(publicAccountTypeFrom("studio"), "studio");
  assert.equal(publicAccountTypeFrom("buyer"), "buyer");
});

test("does not silently map investor or unknown roles to creator", () => {
  assert.equal(publicAccountTypeFrom("investor"), null);
  assert.equal(publicAccountTypeFrom("super_admin"), null);
  assert.equal(publicAccountTypeFrom(undefined), null);
});
