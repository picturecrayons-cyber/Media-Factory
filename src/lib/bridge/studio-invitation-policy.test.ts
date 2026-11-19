import assert from "node:assert/strict";
import test from "node:test";
import { assertStudioInvitationAcceptable } from "./studio-invitation-policy.ts";

const now = new Date("2026-11-18T12:00:00.000Z");
const validInvite = {
  email: "Studio.Member@example.com",
  expiresAt: "2026-11-25T12:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
};

test("accepts only a matching verified account email, case-insensitively", () => {
  assert.doesNotThrow(() => assertStudioInvitationAcceptable({
    invite: validInvite,
    verifiedEmail: " studio.member@EXAMPLE.com ",
    emailVerified: true,
    now,
  }));
});

test("rejects missing invitations and unverified email identities", () => {
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: null, verifiedEmail: "studio.member@example.com", emailVerified: true, now,
  }), /verified matching account/);
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: validInvite, verifiedEmail: "studio.member@example.com", emailVerified: false, now,
  }), /verified matching account/);
});

test("rejects email mismatch, accepted, revoked and expired invitations", () => {
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: validInvite, verifiedEmail: "attacker@example.com", emailVerified: true, now,
  }), /does not match/);
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: { ...validInvite, acceptedAt: "2026-11-18T11:00:00.000Z" },
    verifiedEmail: "studio.member@example.com", emailVerified: true, now,
  }), /invalid, expired or already used/);
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: { ...validInvite, revokedAt: "2026-11-18T11:00:00.000Z" },
    verifiedEmail: "studio.member@example.com", emailVerified: true, now,
  }), /invalid, expired or already used/);
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: { ...validInvite, expiresAt: "2026-11-18T11:59:59.999Z" },
    verifiedEmail: "studio.member@example.com", emailVerified: true, now,
  }), /invalid, expired or already used/);
});

test("rejects malformed expiry timestamps and invalid clocks fail closed", () => {
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: { ...validInvite, expiresAt: "not-a-date" },
    verifiedEmail: "studio.member@example.com", emailVerified: true, now,
  }), /invalid, expired or already used/);
  assert.throws(() => assertStudioInvitationAcceptable({
    invite: validInvite,
    verifiedEmail: "studio.member@example.com",
    emailVerified: true,
    now: new Date("invalid"),
  }), /invalid, expired or already used/);
});
