import test from "node:test";
import assert from "node:assert/strict";
import { isInvestorPreviewGrantActive } from "./investor-preview-policy.ts";
test("investor preview grant is active before expiry",()=>assert.equal(isInvestorPreviewGrantActive({expiresAt:"2027-01-01T00:00:00.000Z",revokedAt:null},Date.parse("2026-11-10T00:00:00.000Z")),true));
test("expired investor preview grant is denied",()=>assert.equal(isInvestorPreviewGrantActive({expiresAt:"2026-01-01T00:00:00.000Z",revokedAt:null},Date.parse("2026-11-10T00:00:00.000Z")),false));
test("revoked investor preview grant is denied",()=>assert.equal(isInvestorPreviewGrantActive({expiresAt:"2027-01-01T00:00:00.000Z",revokedAt:"2026-11-09T00:00:00.000Z"},Date.parse("2026-11-10T00:00:00.000Z")),false));
test("invalid expiry fails closed",()=>assert.equal(isInvestorPreviewGrantActive({expiresAt:"invalid",revokedAt:null}),false));
