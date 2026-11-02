import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Buyer A/B cannot create a license order without server-resolved organization scope", () => {
  const source = read("../bridge/payments.ts");
  assert.match(source, /actor\.accountType === "buyer" && !actor\.organizationId/);
  assert.match(source, /BRIDGE_LICENSE_ORDER_BLOCKED/);
});

test("license payment fulfillment fails closed without canonical mandate authorization", () => {
  const source = read("../bridge/payments.ts");
  assert.match(source, /payment\.purpose === "title_license"/);
  assert.match(source, /BRIDGE_LICENSE_FULFILLMENT_BLOCKED/);
});

test("buyer entitlements and signed downloads are withheld without tenant-scoped rights", () => {
  const payments = read("../bridge/payments.ts");
  const assets = read("../bridge/assets.ts");
  assert.match(payments, /actor\.accountType === "buyer" && !actor\.internalRole\) return \{ entitlements: \[\] \}/);
  assert.match(assets, /async function hasLicenseEntitlement\(_userId: string, _titleId: string\): Promise<boolean> \{[\s\S]*?return false;/);
});

test("Edge webhook cannot bypass canonical Bridge license fulfillment", () => {
  const source = read("../../../supabase/functions/razorpay-webhook/index.ts");
  assert.match(source, /localPayment\?\.purpose === "title_license"/);
  assert.match(source, /Bridge license fulfillment blocked pending CRA-165 authorization/);
});

test("all single-actor internal grants are denied pending independent dual control", () => {
  const source = read("../bridge/rbac.ts");
  assert.match(source, /export function canGrantInternalRole\(_actor: Actor, _role: InternalRole\): boolean \{\s*return false;/);
});
