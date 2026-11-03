import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assertBuyerLicenseOrderBlocked, requireDirectBridgeIdentity } from "./authorization-guards.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Buyer A and Buyer B are denied even when each has an organization ID", () => {
  const buyerA = { userId: "buyer-a", accountType: "buyer", organizationId: "org-a" };
  const buyerB = { userId: "buyer-b", accountType: "buyer", organizationId: "org-b" };
  assert.throws(() => assertBuyerLicenseOrderBlocked(buyerA), /BRIDGE_LICENSE_ORDER_BLOCKED/);
  assert.throws(() => assertBuyerLicenseOrderBlocked(buyerB), /BRIDGE_LICENSE_ORDER_BLOCKED/);
});

test("non-buyer title owners are not blocked by the buyer-only guard", () => {
  assert.doesNotThrow(() => assertBuyerLicenseOrderBlocked({
    userId: "creator-a",
    accountType: "independent_creator",
    organizationId: null,
  }));
});

test("direct immutable auth subject resolves only when it exactly matches the profile subject", () => {
  assert.equal(requireDirectBridgeIdentity("auth-a", "auth-a"), "auth-a");
  assert.throws(() => requireDirectBridgeIdentity("auth-a", null), /BRIDGE_IDENTITY_UNRESOLVED/);
  assert.throws(() => requireDirectBridgeIdentity("auth-a", "legacy-bridge-user"), /BRIDGE_IDENTITY_UNRESOLVED/);
});

test("session resolver has no email or legacy identity-link fallback", () => {
  const source = read("../bridge/session.ts");
  const resolver = source.slice(
    source.indexOf("export async function resolveBridgeUserId"),
    source.indexOf("export async function loadActor"),
  );
  assert.ok(resolver.includes("requireDirectBridgeIdentity"));
  assert.equal(resolver.includes("bridge_loop_identity_links"), false);
  assert.equal(resolver.includes("auth.users"), false);
  assert.equal(resolver.toLowerCase().includes("email"), false);
});

test("license payment fulfillment fails closed without canonical mandate authorization", () => {
  const source = read("../bridge/payments.ts");
  assert.ok(source.includes('payment.purpose === "title_license"'));
  assert.ok(source.includes("BRIDGE_LICENSE_FULFILLMENT_BLOCKED"));
});

test("buyer entitlements and signed downloads are withheld without tenant-scoped rights", () => {
  const payments = read("../bridge/payments.ts");
  const assets = read("../bridge/assets.ts");
  assert.ok(payments.includes('if (actor.accountType === "buyer") return { entitlements: [] };'));
  assert.ok(assets.includes("async function hasLicenseEntitlement"));
  assert.ok(assets.includes("return false;"));
});

test("Edge webhook cannot bypass canonical Bridge license fulfillment", () => {
  const source = read("../../../supabase/functions/razorpay-webhook/index.ts");
  assert.ok(source.includes('localPayment?.purpose === "title_license"'));
  assert.ok(source.includes("Bridge license fulfillment blocked pending CRA-165 authorization"));
});

test("all single-actor internal grants are denied pending independent dual control", () => {
  const source = read("../bridge/rbac.ts");
  assert.ok(source.includes("export function canGrantInternalRole(_actor: Actor, _role: InternalRole): boolean"));
  assert.ok(source.includes("return false;"));
});
