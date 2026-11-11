# Buyer account implementation — YouTube platform buyer

**Status: implementation proposal / not applied.** This proposal is for the canonical Bridge application. It does not create a YouTube relationship, grant buyer access, or certify legal authority.

## Existing implementation facts

- The canonical app already has a `buyer` account type and `/buyer` dashboard.
- The dashboard currently lists titles returned by `listTitles()` and can initiate a Razorpay license order.
- `bridge_organizations` and `bridge_organization_memberships` were introduced for Studio organization scope. Their current schema has only legal name, normalized name and active/suspended/closed status; it does not encode buyer type, legal verification, or acquisition mandate.
- The Buyer account currently has no first-class organization verification or mandate scope in the organization model. Therefore do not simply create a buyer user, set a display name to YouTube, or allow it to transact.

## Proposed account model

1. Keep `account_type = 'buyer'`; no new privileged RBAC role.
2. Extend the organization record with `organization_kind`, `verification_status`, `commercial_capacity`, `verified_at`, and `verified_by`.
3. Add server-only `bridge_buyer_mandates` records containing counterparty legal name, representative, documentary evidence hash/reference, channel/media/territory/language scope, exploitation models, exclusivity, sublicensing, delegation, validity window, reviewer and status.
4. YouTube remains a provisional display label until the actual contracting legal entity and authorized acquisition mandate are evidenced and reviewed.
5. Organization membership must be explicitly invited/approved by Bridge Admin; never inferred from email domain, channel URL, OAuth identity, organization display name, or user-supplied organization ID.

## Required server enforcement before enabling Buyer Dashboard transactions

- Resolve buyer organization from authenticated Bridge profile + active membership on the server.
- Require organization kind in buyer/platform_buyer/distributor/aggregator and verification status = verified.
- Require at least one active, verified, non-expired, non-revoked mandate.
- For every title, intersect mandate scope with valid rights grant and legal/QC clearance. Fail closed on missing, ambiguous, expired or revoked evidence.
- Apply same checks to discovery, title detail, screener issuance, offer, order creation, payment verification, entitlement creation, delivery, and finance reconciliation. Hiding buttons is not authorization.
- Bind every record to organization ID, actor ID, mandate ID, title ID, exact rights scope, contract and audit evidence.
- Do not expose mandate or organization control-plane tables to anon/authenticated browser roles. Server-only service access plus explicit RBAC and audit.
- Separate buyer acquisition/licensing payments from Creator YPP/AdSense earnings.

## YouTube-specific limits

- Public YouTube Data / Analytics / Reporting APIs are only used after OAuth consent, scope review, and applicable account authorization.
- Content ID / Content Manager is partner-restricted. Do not enable those operations without documented YouTube partner access.
- An API-connected channel is not proof of a film acquisition mandate.

## Required tests

- unverified buyer organization denied dashboard transaction operations;
- verified organization with no active mandate denied;
- mandate expired/revoked/suspended/rejected denied;
- territory, language, channel, media, exploitation model, term and exclusivity mismatch denied;
- buyer A cannot read buyer B's titles, screeners, offers, orders, entitlements or deliveries;
- browser anon/authenticated cannot read/write buyer mandate records;
- changing client-supplied organization_id / mandate_id cannot widen access;
- valid mandate + valid title rights + QC/legal pass permits only the exact authorized transaction;
- all denials and approvals emit auditable events;
- existing Studio/Creator/Buyer regression tests pass.

## Release controls

- STAGING DB `jbymleftneggcgutlcqu`: READ-ONLY. First reconcile applied migration history and table/grant/RLS compatibility. No SQL execution, migration, seed, RLS/ACL/Auth change, or runtime test until separately approved.
- PRODUCTION DB `mlmgugivsyoxzdgwkbpu`: HOLD / NOT CERTIFIED / NO-GO. No queries or writes.
- This SQL is a proposal artifact only, not an executable migration. Do not move it into the migration runner until gates are cleared.
- No live YouTube OAuth credentials, channel linking, Content ID operations, payment, email, merge or deployment.
- No paid upgrades. Preserve current Creator, Studio and Buyer workflows — App-inu pani kittaruthu.
