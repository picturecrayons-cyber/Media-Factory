# Multi-buyer organization and rights-mandate isolation

**Status: source-only policy proposal — NOT IMPLEMENTED / NOT RUNTIME-TESTED.**  
Parent: Linear CRA-154. Dedicated scope: CRA-160. Isolation prerequisite: CRA-128.

## 1. Scope: every rights counterparty

Keep the existing Bridge external account types unchanged: `independent_creator`, `studio`, `buyer`, `investor`. A counterparty's commercial capacity is data attached to a legal organization and verified membership, not a new permission-bearing account type.

Coverage must include:

- **Linear:** free-to-air, pay-TV, cable, satellite, IPTV, channel/network operators and territory broadcasters.
- **Non-linear:** OTT/SVOD, AVOD, TVOD, FAST, catch-up, streaming platforms and digital storefronts.
- **Ancillary:** theatrical/exhibition, airline, hotel/hospitality, educational/institutional, non-theatrical, clip/short-form, promotional, soundtrack/music, remake/adaptation, merchandising and other separately granted exploitation.
- **Intermediaries:** distributors, sub-distributors, sales agents, aggregators, collection agents and territory representatives.

These labels describe business capacity only. They do not confer rights, access, publication authority, sublicensing authority or internal Bridge permissions.

## 2. Authority chain

Model and verify these separately:

1. **Rights principal:** owner or licensee with documented onward rights.
2. **Mandate issuer:** principal or authorized party issuing a distribution / agency / aggregation mandate.
3. **Intermediary:** agent, distributor, sub-distributor or aggregator acting within the exact mandate.
4. **Transaction buyer:** legal entity contracting for a defined exploitation scope.
5. **User:** authenticated individual with an active membership in the legal entity.

A downstream party cannot receive broader rights than the upstream principal's grant. No organization name, email domain, user metadata, buyer label or client-supplied organization ID can establish this chain.

## 3. Grant dimensions (must be explicit)

Every grant/package/entitlement must bind, as applicable:

- title and version / asset class;
- legal rights principal and mandate chain;
- buyer legal organization and acting member;
- territory / permitted countries and exclusions;
- language, subtitles and dubbing;
- channel and exploitation medium (linear, non-linear, ancillary subtype);
- platform/service and distribution window;
- start/end time, holdbacks and embargoes;
- exclusivity and conflicting-grant rules;
- sublicensing / onward delegation permission and limits;
- promotional, clip, music, remake, adaptation and merchandising rights as separate grant types;
- permitted asset kinds (e.g. screener/subtitle only; never master/technical by default);
- revocation, expiry, suspension, evidence and audit history.

A generic title-level entitlement must never imply all territories, channels, media, assets or ancillary rights.

## 4. Required tenant binding

Each order, payment, package, entitlement, delivery and audit record must retain exact organization scope and a stable relationship to the rights grant/mandate. At minimum, the authorization join must prove the authenticated user is an active member of the buyer organization and that the organization's entitlement matches the requested title and permitted exploitation scope.

Missing organization, inactive membership, missing mandate, expired/revoked grant, ambiguous principal, scope mismatch or legacy unscoped entitlement = **DENY**.

Buyer A/B, Broadcaster A/B, Platform A/B, Distributor A/B, Aggregator A/B, Ancillary Buyer A/B and Studio A/B must be isolated for discovery, title metadata, payment/order records, packages, entitlements, downloads, deliveries, finance fields and audit events.

## 5. Source-grounded blockers

The inspected source currently shows:

- `createLicenseOrder` inserts `bridge_payments` without `organization_id`.
- `grantFromCapturedPayment` inserts `bridge_package_entitlements` and `bridge_entitlements` without buyer organization scope.
- Package licensing updates `bridge_license_packages.buyer_user_id` but does not bind the buyer legal organization or a mandate record.
- Current account type remains `buyer`; the counterparty taxonomy above is a proposed data/domain layer, not an existing implemented feature.
- `resolveBridgeUserId` has a legacy verified-email profile fallback requiring policy review.
- Existing internal role-grant policy allows Admin→Admin and Super Admin→Super Admin. Governance must be decided separately; no role grants are authorized.

Therefore multi-counterparty organization isolation is **FAIL / NOT CERTIFIED** at source-contract level. Do not create real payments or invoke webhook fulfillment to test it.

## 6. Required source inventory and STAGING DB proposal

Trace each route, loader, server function, API handler, webhook and direct SQL path for:
- actor identity and active organization membership;
- permission and title scope;
- principal/mandate verification;
- channel/territory/language/window/exclusivity checks;
- asset-kind authorization;
- audit event and denial behavior;
- exact organization join path and RLS expectation.

Prepare an object-by-object **STAGING DB** proposal for organizations, memberships, rights principals, mandates, rights grants, packages, orders, payments, entitlements, deliveries, audit records, sequences and privileged functions. Record object owner, dependencies, effective grants (including PUBLIC/inherited/default privileges), RLS policy predicates, service-role exceptions, indexes/constraints, migration order and rollback. No blanket grants or ACL changes.

## 7. Synthetic verification matrix — blocked until CRA-128

After CRA-128 proves the exact Preview server-side Supabase ref and OCI identity/bucket boundary, and after separate approval, use synthetic users and organizations to test:

| Scenario | Expected |
|---|---|
| Buyer A reads Buyer B order/payment/entitlement | DENY |
| Distributor A attempts a title outside its mandate | DENY |
| Aggregator attempts onward sublicense without explicit authority | DENY |
| Linear broadcaster requests non-linear rights | DENY |
| OTT platform requests linear or ancillary rights | DENY |
| Ancillary buyer requests unrelated ancillary subtype | DENY |
| Any counterparty requests territory/language outside grant | DENY |
| Expired, revoked, suspended or future-dated grant | DENY |
| Buyer requests master/technical asset | DENY |
| Exact active buyer + mandate + grant + scope + permitted screener | ALLOW only after all other gates pass |
| Studio A reads or mutates Studio B title/assets | DENY |
| Direct API invocation bypassing UI | Same result as server authorization |
| Direct Data API access without explicit least-privilege RLS policy | DENY |

## 8. Execution boundary

- Source-only until CRA-128 proves Preview Supabase and OCI isolation.
- **STAGING DB** `jbymleftneggcgutlcqu`: no query, SQL, migration, RLS/grant/Auth change, seed or write in this work.
- **PRODUCTION DB** `mlmgugivsyoxzdgwkbpu`: untouched; read-only only.
- No synthetic runtime/E2E tests, payment, webhook, invitation, email, title/asset/rights mutation, merge or deployment.
- Independent legal/business and security review required before implementation.
- **PRODUCTION: HOLD / NOT CERTIFIED / NO-GO.**
- **App-inu pani kittaruthu.**
