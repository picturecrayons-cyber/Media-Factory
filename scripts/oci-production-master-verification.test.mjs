import test from "node:test";
import assert from "node:assert/strict";
import { assertProductionDatabaseTarget, createGuardedProductionPool, compareObjectSizes, isCanonicalMasterVerified, classifyObjectError } from "./oci-production-master-verification-lib.mjs";

const ref = "mlmgugivsyoxzdgwkbpu";
const api = `https://${ref}.supabase.co`;
const direct = `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`;
const pooler = `postgresql://postgres.${ref}:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

test("accepts the exact Supabase direct database host and trusted username", () => {
  assert.equal(assertProductionDatabaseTarget(api, direct, ref), true);
});

test("accepts a pooler URL only when host and username pin the project ref", () => {
  assert.equal(assertProductionDatabaseTarget(api, pooler, ref), true);
});

test("rejects a different Supabase database project", () => {
  assert.throws(() => assertProductionDatabaseTarget(api, "postgresql://postgres:secret@db.otherproject.supabase.co:5432/postgres", ref), /does not prove/);
});

test("rejects a wrong Supabase API project", () => {
  assert.throws(() => assertProductionDatabaseTarget("https://otherproject.supabase.co", direct, ref), /expected Production project/);
});

for (const [label, url] of [
  ["host", `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?host=attacker.example`],
  ["username", `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?user=attacker`],
  ["port", `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?port=6543`],
  ["database", `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?dbname=attacker`],
  ["pooler host", `postgresql://postgres.${ref}:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?host=attacker.example`],
]) {
  test(`rejects ${label} query override before constructing a pool`, () => {
    let poolConstructed = false;
    class SpyPool { constructor() { poolConstructed = true; } }
    assert.throws(() => createGuardedProductionPool(SpyPool, api, url, ref), /forbidden target override/);
    assert.equal(poolConstructed, false, "Pool constructor must never run for an overridden target");
  });
}

test("rejects a direct-host username that is not the trusted Production role", () => {
  let poolConstructed = false;
  class SpyPool { constructor() { poolConstructed = true; } }
  const wrongUser = `postgresql://attacker:secret@db.${ref}.supabase.co:5432/postgres`;
  assert.throws(() => createGuardedProductionPool(SpyPool, api, wrongUser, ref), /host and username/);
  assert.equal(poolConstructed, false);
});

test("rejects a pooler username that does not pin the Production project", () => {
  assert.throws(() => assertProductionDatabaseTarget(api, "postgresql://postgres.otherproject:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres", ref), /host and username/);
});

test("detects exact database and OCI byte-size match", () => {
  assert.deepEqual(compareObjectSizes(1024, 1024), { status: "MATCH", matches: true });
});

test("flags database and OCI byte-size mismatch", () => {
  assert.deepEqual(compareObjectSizes(1024, 1025), { status: "MISMATCH", matches: false });
});

test("does not treat a missing database size as a match", () => {
  assert.deepEqual(compareObjectSizes(null, 1024), { status: "UNRECORDED", matches: false });
});

test("requires master_key to resolve to an existing size-matched candidate", () => {
  const objects = [{ objectKey: "master-a", result: "EXISTS", sizeStatus: "MATCH" }];
  assert.equal(isCanonicalMasterVerified("master-a", objects), true);
  assert.equal(isCanonicalMasterVerified(null, objects), false);
  assert.equal(isCanonicalMasterVerified("master-b", objects), false);
  assert.equal(isCanonicalMasterVerified("master-a", [{ objectKey: "master-a", result: "NOT_FOUND", sizeStatus: "MATCH" }]), false);
});

test("classifies an OCI 404 as a missing object", () => {
  assert.equal(classifyObjectError("OCI object verification failed (404)"), "NOT_FOUND");
});

test("classifies non-404 OCI failures as errors", () => {
  assert.equal(classifyObjectError("OCI object verification failed (401)"), "ERROR");
});
