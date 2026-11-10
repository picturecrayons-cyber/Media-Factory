import test from "node:test";
import assert from "node:assert/strict";
import { isBuyerScreeningGrantActive } from "./buyer-screening-access.ts";

test("active grant is allowed before expiry",()=>assert.equal(isBuyerScreeningGrantActive({expiresAt:"2027-01-01T00:00:00.000Z",revokedAt:null},Date.parse("2026-11-10T00:00:00.000Z")),true));
test("expired grant is denied",()=>assert.equal(isBuyerScreeningGrantActive({expiresAt:"2026-01-01T00:00:00.000Z",revokedAt:null},Date.parse("2026-11-10T00:00:00.000Z")),false));
test("revoked grant is denied",()=>assert.equal(isBuyerScreeningGrantActive({expiresAt:"2027-01-01T00:00:00.000Z",revokedAt:"2026-11-09T00:00:00.000Z"},Date.parse("2026-11-10T00:00:00.000Z")),false));
test("invalid expiry fails closed",()=>assert.equal(isBuyerScreeningGrantActive({expiresAt:"not-a-date",revokedAt:null}),false));
