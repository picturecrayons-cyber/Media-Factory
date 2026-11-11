# Buyer account implementation — YouTube platform buyer

**Current status: STAGING schema foundation applied; application authorization integration remains incomplete.** This work does not create a YouTube relationship, grant buyer access, or certify legal authority.

## Model boundaries

- Keep `account_type = 'buyer'`; no new privileged RBAC role.
- Distinguish (a) buyer requirements/intelligence, (b) story-concept buyer mandates, (c) legal platform acquisition mandates, and (d) title-specific buyer access.
- YouTube is a provisional platform label. The contracting legal entity, authorized representative, channel, scope, and documentary mandate must be verified before transactions are enabled.
- OAuth/channel connection and public YouTube APIs do not prove acquisition authority. Content ID / Content Manager remains partner-restricted.

## STAGING schema implemented

**STAGING DB:** Supabase project `jbymleftneggcgutlcqu`.
**Action:** Applied two additive migrations; Access: WRITE (explicitly authorized by user); Risk: moderate — additive private-schema DDL, no existing records altered and no production access.

1. `20261111163440_buyer_acquisition_mandate_legal_scope`
   - `bridge_private.buyer_acquisition_mandates`: organization, platform/account/channel, territory, language, media, exploitation model, exclusivity, sublicensing/delegation, effective term, reviewer, status and revocation metadata.
   - `bridge_private.buyer_acquisition_mandate_evidence`: evidence kind, private object path, SHA-256, uploader and reviewer metadata.
2. `20261111163555_buyer_organization_legal_verification`
   - `bridge_private.buyer_organization_verifications`: buyer classification, legal registration metadata, official website, verification status and reviewer metadata.
   - `bridge_private.buyer_organization_verification_evidence`: private evidence object references, hashes and review metadata.

Both migrations:
- Keep sensitive legal data in `bridge_private`, not in public organization rows.
- Enable RLS and install explicit `deny_browser_access` policies for `anon` and `authenticated`.
- Revoke browser-role table privileges; grant required table privileges only to `service_role`.
- Preserve `bridge_story_concept_mandates`, buyer intelligence tables and existing title access records without rewriting them.
- Store evidence object references only; document bytes must remain in private object storage.

Migration source files are committed to the integration branch under `supabase/migrations/`.

## STAGING verification evidence

- Both migration versions are present in `supabase_migrations.schema_migrations`.
- All four new tables exist with RLS enabled.
- All four tables have exactly the expected deny-browser policy.
- `has_table_privilege` checks: anon SELECT = false; authenticated SELECT = false; service_role SELECT/INSERT = true for all four tables.
- No application or sample buyer rows were inserted; existing records were not updated or deleted.
- Security advisor still reports unrelated existing findings (7 RLS-enabled/no-policy tables, 3 security-definer exposure findings across 2 functions, and leaked-password protection disabled). These were not changed by this scoped migration.

## Application integration still required

The new policy helper is pure and fail-closed, but is **not wired into live Buyer server functions**. Current `createLicenseOrder` still does not resolve a verified buyer organization + active acquisition mandate; captured-payment entitlement flow also lacks mandate revalidation. Admin/legal UI and end-to-end cross-tenant tests are not yet implemented.

Required before Buyer transactions can be certified:
- Resolve buyer organization only from authenticated profile + active membership on the server.
- Load private verification and mandate rows server-side; never trust client organization/mandate IDs.
- Require verified organization, accepted evidence, approved mandate, active term, and exact channel/territory/language/media/exploitation/exclusivity scope.
- Enforce at discovery, screener, offer, order creation, payment verification, entitlement creation, delivery and finance.
- Revalidate the mandate before granting entitlements and before delivery; fail closed on revoked/expired/suspended mandates.
- Add Admin/legal review endpoints and UI with immutable audit events.
- Add tenant A/B isolation and existing Creator/Studio/Buyer regression tests.

## Release controls

- **STAGING DB:** `jbymleftneggcgutlcqu` — the user authorized WRITE only for this mandate schema, RLS/ACL and test-only verification scope.
- **PRODUCTION DB:** `mlmgugivsyoxzdgwkbpu` — Action: none; Access: NO-GO; Risk: protected release hold. No Production query, write, migration or deployment.
- No merge, Production deployment, live YouTube OAuth/channel linking, Content ID operation, payment, or email was performed.
- No paid upgrades. Preserve current Creator, Studio and Buyer workflows — App-inu pani kittaruthu.

## Source-only policy milestone

- `src/lib/bridge/buyer-mandate-policy.ts` implements pure fail-closed checks for organization verification, mandate status/term, exact channel/territory/language/media/exploitation scope, exclusivity, sublicensing and onward delegation.
- `src/lib/bridge/buyer-mandate-policy.test.ts` contains positive/negative policy cases and is included in `npm test`.
- Passing these unit tests does not prove live endpoint enforcement.
