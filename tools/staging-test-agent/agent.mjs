#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const EXPECTED_PROJECT = "jbymleftneggcgutlcqu";
const DENIED_PROJECTS = new Set(["mlmgugivsyoxzdgwkbpu"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_ROLES = ["A", "B", "C", "ADMIN"];
const TESTS = [
  ["IDENTITY-01", "Bridge/Auth identity link is unique and owned by the supplied Auth UUID"],
  ["IDENTITY-02", "Duplicate Auth UUID and duplicate Bridge identity links are rejected"],
  ["IDENTITY-03", "Unverified email-only identity linking is rejected"],
  ["RLS-01", "User A cannot read User B payment events or TVOD entitlements"],
  ["RLS-02", "Unlinked User C cannot access Bridge-owned title resources"],
  ["PAY-01", "Invalid payment webhook creates no entitlement"],
  ["PAY-02", "Duplicate/replayed payment event creates exactly one entitlement"],
  ["PAY-03", "Captured synthetic TVOD payment creates exactly one entitlement"],
  ["PAY-04", "Refund behavior follows the owner-approved revocation rule"],
  ["PUB-01", "Unpublished or unauthorized title playback is denied"]
];

function fail(message) {
  console.error(`BLOCKED — ${message}`);
  process.exitCode = 2;
}

const args = process.argv.slice(2);
const fixturePath = args[args.indexOf("--fixtures") + 1];
if (!args.includes("--dry-run") || !fixturePath || args.includes("--execute")) {
  fail("Only --dry-run is supported. No execution adapter exists.");
} else {
  try {
    const f = JSON.parse(await readFile(fixturePath, "utf8"));
    if (DENIED_PROJECTS.has(f.projectId)) throw new Error("Production project is explicitly denied.");
    if (f.environment !== "STAGING" || f.projectId !== EXPECTED_PROJECT) throw new Error("Fixture must target the approved STAGING project only.");
    if (f.syntheticOnly !== true) throw new Error("syntheticOnly must be true.");
    if (!Array.isArray(f.users) || f.users.length !== 4) throw new Error("Exactly four synthetic users are required.");
    const roles = new Set(f.users.map(u => u.role));
    if (REQUIRED_ROLES.some(role => !roles.has(role))) throw new Error("Required roles A, B, C, ADMIN are missing.");
    const authIds = f.users.map(u => u.authUserId);
    if (authIds.some(id => typeof id !== "string" || !UUID.test(id))) throw new Error("Every Auth UUID must be a valid UUID supplied by the owner.");
    if (new Set(authIds).size !== authIds.length) throw new Error("Duplicate Auth UUID detected.");
    const bridgeIds = f.users.map(u => u.bridgeUserId).filter(Boolean);
    if (new Set(bridgeIds).size !== bridgeIds.length) throw new Error("Duplicate Bridge identity detected.");
    const unlinked = f.users.find(u => u.role === "C");
    if (unlinked.bridgeUserId !== null) throw new Error("User C must remain intentionally unlinked.");
    console.log("PASS — fixture shape and STAGING target validated.");
    console.log("NOT TESTED — no database/API calls are made by this scaffold.");
    for (const [id, description] of TESTS) console.log(`BLOCKED — ${id}: ${description}`);
    console.log("Production access: DENIED; database writes: NONE; deployment: NONE.");
  } catch (error) {
    fail(error.message);
  }
}
