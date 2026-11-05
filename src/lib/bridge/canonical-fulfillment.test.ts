import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeBridgeLicenseScope,
  fulfillCapturedBridgePayment,
  type CanonicalEntitlement,
  type CanonicalPaymentOrder,
  type FulfillmentRepository,
  type LicenseAuthorization,
  type ProviderCapture,
} from "./canonical-fulfillment.ts";

const now = new Date("2026-11-05T12:00:00.000Z");
const scope = {
  territory: "IN",
  language: "Malayalam",
  exploitationModel: "TVOD",
  assetKinds: ["screener", "subtitle"],
  now,
};
const grant: LicenseAuthorization = {
  buyerUserId: "buyer-user-a",
  buyerOrganizationId: "buyer-org-a",
  membershipStatus: "active",
  organizationStatus: "active",
  rightsPrincipalOrganizationId: "rights-owner",
  transactionBuyerOrganizationId: "buyer-org-a",
  rightsGrantId: "rights-grant-a",
  mandateId: "mandate-a",
  mandateStatus: "active",
  mandateWindowStart: "2026-01-01T00:00:00Z",
  mandateWindowEnd: "2027-01-01T00:00:00Z",
  mandateChain: [
    { organizationId: "rights-owner", status: "active", canDelegate: true, windowStart: "2026-01-01T00:00:00Z", windowEnd: "2027-01-01T00:00:00Z" },
    { organizationId: "buyer-org-a", status: "active", canDelegate: false, windowStart: "2026-01-01T00:00:00Z", windowEnd: "2027-01-01T00:00:00Z" },
  ],
  titleId: "title-a",
  packageId: "package-a",
  authorizationStatus: "authorized",
  territories: ["IN"],
  languages: ["Malayalam"],
  exploitationModels: ["TVOD"],
  assetKinds: ["screener", "subtitle"],
  rightsWindowStart: "2026-02-01T00:00:00Z",
  rightsWindowEnd: "2026-12-01T00:00:00Z",
  revokedAt: null,
};
const request = {
  buyerUserId: "buyer-user-a",
  buyerOrganizationId: "buyer-org-a",
  titleId: "title-a",
  packageId: "package-a",
  ...scope,
};

function makePayment(): CanonicalPaymentOrder {
  return {
    id: "payment-record-a",
    userId: "buyer-user-a",
    buyerOrganizationId: "buyer-org-a",
    titleId: "title-a",
    packageId: "package-a",
    rightsGrantId: "rights-grant-a",
    mandateId: "mandate-a",
    providerOrderId: "order-a",
    providerPaymentId: null,
    amountPaise: 125000,
    currency: "INR",
    status: "created",
  };
}

function makeHarness(overrides: {
  payment?: CanonicalPaymentOrder;
  authorization?: LicenseAuthorization | null;
  capture?: ProviderCapture;
  prior?: CanonicalEntitlement | null;
} = {}) {
  const state = {
    transactionCalls: 0,
    markCalls: 0,
    insertCalls: 0,
    auditCalls: 0,
    payment: overrides.payment ?? makePayment(),
    entitlement: overrides.prior ?? null as CanonicalEntitlement | null,
  };
  const capture = overrides.capture ?? {
    orderId: "order-a", paymentId: "pay-a", status: "captured", amountPaise: 125000, currency: "INR",
  };
  const repository: FulfillmentRepository<{ tx: true }> = {
    async transaction(work) {
      state.transactionCalls++;
      return work({ tx: true });
    },
    async lockPaymentByProviderOrderId() { return state.payment; },
    async findEntitlementByProviderPaymentId() { return state.entitlement; },
    async loadAuthorization() { return overrides.authorization === undefined ? grant : overrides.authorization; },
    async markPaymentCaptured(_tx, payment, providerCapture) {
      state.markCalls++;
      state.payment = { ...payment, status: "captured", providerPaymentId: providerCapture.paymentId };
    },
    async insertEntitlement(_tx, entitlement) {
      state.insertCalls++;
      state.entitlement = entitlement;
    },
    async writeFulfillmentAudit() { state.auditCalls++; },
  };
  return { state, capture, repository };
}

test("allows exact active organization, mandate chain, title, package and exploitation scope", () => {
  assert.deepEqual(authorizeBridgeLicenseScope(grant, request), { allow: true, reason: "ALLOW" });
});

test("denies Buyer A/B and transaction-counterparty organization mismatch", () => {
  assert.equal(authorizeBridgeLicenseScope(grant, { ...request, buyerOrganizationId: "buyer-org-b" }).reason, "ORGANIZATION_SCOPE_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, transactionBuyerOrganizationId: "buyer-org-b" }, request).reason, "ORGANIZATION_SCOPE_MISMATCH");
});

test("denies identity, inactive membership and inactive legal organization", () => {
  assert.equal(authorizeBridgeLicenseScope({ ...grant, buyerUserId: "other-user" }, request).reason, "BUYER_IDENTITY_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, membershipStatus: "suspended" }, request).reason, "ORGANIZATION_INACTIVE");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, organizationStatus: "inactive" }, request).reason, "ORGANIZATION_INACTIVE");
});

test("denies mandate overreach, cycles, missing links and expired mandate", () => {
  assert.equal(authorizeBridgeLicenseScope({ ...grant, mandateChain: [{ ...grant.mandateChain[0], canDelegate: false }, grant.mandateChain[1]] }, request).reason, "MANDATE_CHAIN_INVALID");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, mandateChain: [grant.mandateChain[0], { ...grant.mandateChain[1], organizationId: "rights-owner" }] }, request).reason, "MANDATE_CHAIN_INVALID");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, mandateChain: [] }, request).reason, "MANDATE_CHAIN_INVALID");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, mandateWindowEnd: "2026-11-01T00:00:00Z" }, request).reason, "MANDATE_INVALID");
});

test("denies title/package, territory/language/model/asset mismatch and revocation", () => {
  assert.equal(authorizeBridgeLicenseScope(grant, { ...request, titleId: "title-b" }).reason, "TITLE_OR_PACKAGE_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope(grant, { ...request, packageId: null }).reason, "TITLE_OR_PACKAGE_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, territories: ["US"] }, request).reason, "RIGHTS_SCOPE_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, languages: ["Tamil"] }, request).reason, "RIGHTS_SCOPE_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, exploitationModels: ["SVOD"] }, request).reason, "RIGHTS_SCOPE_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, assetKinds: ["master"] }, request).reason, "RIGHTS_SCOPE_MISMATCH");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, revokedAt: now }, request).reason, "RIGHTS_NOT_ACTIVE");
});

test("denies missing and malformed or out-of-window rights terms", () => {
  assert.equal(authorizeBridgeLicenseScope(null, request).reason, "MISSING_AUTHORIZATION");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, rightsWindowEnd: null }, request).reason, "RIGHTS_WINDOW_INVALID");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, rightsWindowEnd: "2026-11-01T00:00:00Z" }, request).reason, "RIGHTS_WINDOW_INVALID");
  assert.equal(authorizeBridgeLicenseScope({ ...grant, rightsWindowEnd: "2027-02-01T00:00:00Z" }, request).reason, "RIGHTS_WINDOW_INVALID");
});

test("fulfills once after server-verified capture and writes payment, entitlement and audit in one transaction", async () => {
  const h = makeHarness();
  const result = await fulfillCapturedBridgePayment({
    input: { orderId: "order-a", paymentId: "pay-a", actorUserId: "buyer-user-a", scope },
    verifier: { async fetchCapture() { return h.capture; } },
    repository: h.repository,
    createEntitlementId: () => "entitlement-a",
  });
  assert.equal(result.status, "fulfilled");
  assert.equal(h.state.transactionCalls, 1);
  assert.equal(h.state.markCalls, 1);
  assert.equal(h.state.insertCalls, 1);
  assert.equal(h.state.auditCalls, 1);
  if (result.status === "fulfilled") {
    assert.equal(result.entitlement.buyerOrganizationId, "buyer-org-a");
    assert.equal(result.entitlement.rightsGrantId, "rights-grant-a");
    assert.deepEqual(result.entitlement.assetKinds, ["screener", "subtitle"]);
  }
});

test("rejects amount, currency, status, order and payment mismatch before entitlement write", async () => {
  for (const capture of [
    { ...makeHarness().capture, amountPaise: 1 },
    { ...makeHarness().capture, currency: "USD" },
    { ...makeHarness().capture, status: "authorized" },
    { ...makeHarness().capture, orderId: "other-order" },
    { ...makeHarness().capture, paymentId: "other-payment" },
  ]) {
    const h = makeHarness({ capture });
    await assert.rejects(() => fulfillCapturedBridgePayment({
      input: { orderId: "order-a", paymentId: "pay-a", scope },
      verifier: { async fetchCapture() { return h.capture; } },
      repository: h.repository,
      createEntitlementId: () => "entitlement-a",
    }), /BRIDGE_PROVIDER_CAPTURE_MISMATCH/);
    assert.equal(h.state.insertCalls, 0);
  }
});

test("rejects missing organization/mandate authorization without mutating payment or entitlement", async () => {
  const h = makeHarness({ authorization: null });
  await assert.rejects(() => fulfillCapturedBridgePayment({
    input: { orderId: "order-a", paymentId: "pay-a", scope },
    verifier: { async fetchCapture() { return h.capture; } },
    repository: h.repository,
    createEntitlementId: () => "entitlement-a",
  }), /BRIDGE_LICENSE_AUTHORIZATION_DENIED/);
  assert.equal(h.state.markCalls, 0);
  assert.equal(h.state.insertCalls, 0);
  assert.equal(h.state.auditCalls, 0);
});

test("rejects a browser actor different from the persisted order owner", async () => {
  const h = makeHarness();
  await assert.rejects(() => fulfillCapturedBridgePayment({
    input: { orderId: "order-a", paymentId: "pay-a", actorUserId: "attacker-user", scope },
    verifier: { async fetchCapture() { return h.capture; } },
    repository: h.repository,
    createEntitlementId: () => "entitlement-a",
  }), /BRIDGE_PAYMENT_ORDER_MISMATCH/);
  assert.equal(h.state.insertCalls, 0);
});

test("existing entitlement is idempotent only when it binds the same payment, buyer organization and title", async () => {
  const prior: CanonicalEntitlement = {
    id: "entitlement-existing", paymentRecordId: "payment-record-a", providerPaymentId: "pay-a",
    buyerUserId: "buyer-user-a", buyerOrganizationId: "buyer-org-a", titleId: "title-a",
    packageId: "package-a", rightsGrantId: "rights-grant-a", mandateId: "mandate-a",
    territory: "IN", language: "Malayalam", exploitationModel: "TVOD", assetKinds: ["screener"],
    startsAt: new Date("2026-02-01T00:00:00Z"), endsAt: new Date("2026-12-01T00:00:00Z"),
  };
  const h = makeHarness({ prior });
  const result = await fulfillCapturedBridgePayment({
    input: { orderId: "order-a", paymentId: "pay-a", scope },
    verifier: { async fetchCapture() { return h.capture; } },
    repository: h.repository,
    createEntitlementId: () => "must-not-be-used",
  });
  assert.equal(result.status, "duplicate");
  assert.equal(h.state.markCalls, 0);
  assert.equal(h.state.insertCalls, 0);
  assert.equal(h.state.auditCalls, 0);
});
