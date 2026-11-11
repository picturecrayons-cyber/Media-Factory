# Buyer account implementation — YouTube platform buyer

**Current status: STAGING schema applied; server-side legal review and non-package order/entitlement gates implemented on the branch; end-to-end certification remains incomplete.** This work does not create a YouTube relationship, grant buyer access, or certify legal authority.

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

## Application integration implemented on the PR branch

- Added `src/lib/bridge/buyer-acquisition.ts`:
  - Resolves buyer organization from authenticated `bridge_profiles.organization_id` + active membership + active organization; client-supplied organization IDs are not trusted.
  - Requires verified buyer organization plus accepted company/tax registration and signatory/board evidence.
  - Creates buyer organization verification and YouTube acquisition-mandate submissions.
  - Uploads legal evidence through the existing server-only OCI object-storage provider, verifies the object, seals an immutable copy before recording it, and limits legal evidence to 20 MB PDF/JPEG/PNG.
  - Provides independent evidence review, organization review and mandate review endpoints. The submitter cannot review their own evidence or application.
  - Enforces one unambiguous active approved YouTube mandate, accepted signed agreement/channel ownership/territory/rights evidence, YouTube buyer-channel declaration, and exact title-rights grant scope.
- Added Buyer legal onboarding and evidence-upload UI to `/buyer` plus an Admin/Legal review queue to `/internal` for organization evidence and mandate evidence, with accept/reject and approve/reject/suspend actions.
- `createLicenseOrder` now requires the verified buyer organization and active mandate before contacting Razorpay.
- `grantFromCapturedPayment` re-resolves the buyer and revalidates the mandate before changing payment state or granting an entitlement, including webhook processing.
- Buyer title catalogue, title detail, asset listing and asset-download paths now include legal-organization / mandate gates as appropriate.
- Existing account roles and Creator/Studio permissions were not widened.

## Known implementation blockers — do not certify complete

- **Buyer organization onboarding:** the endpoints require an existing active organization membership. Creating a new buyer organization and owner membership is not included because it would write shared public organization/profile records outside the user's explicitly authorized STAGING DB scope.
- **Evidence UI:** server-side OCI upload/verification endpoints exist, but a complete Buyer upload form and Admin evidence viewer/preview are not yet implemented. Reviewers see object references and must verify source evidence through an approved secure process.
- **YouTube channel identity:** the mandate stores account and channel IDs and requires channel-ownership evidence; no YouTube OAuth/channel ownership API verification is implemented. Manual legal evidence is not an OAuth assertion.
- **Package checkout:** intentionally fails closed until `language_right_ids` can be resolved to canonical language codes and checked against the mandate. Non-package title licensing uses the title's VALID rights grant.
- **Rights mapping:** the current rights grant model does not carry a separately normalized exploitation-model field. Enforcement compares the exact `grant_type` value to the mandate's exploitation-model scope; this needs product/legal confirmation and canonical enum alignment before certification.
- **Offers/negotiations:** no buyer offer server workflow was found to enforce the mandate. A dedicated offer model and gate remain required if offers are part of the transaction.
- **Delivery/finance:** delivery and settlement authorization are not yet bound to the mandate ID or revalidated at each handoff.
- **Cross-tenant isolation:** server queries scope organization/evidence/mandate records to authenticated membership, but Buyer A/B end-to-end tests for discovery, screener, offers, payments, entitlements, delivery and finance are still required.
- **STAGING HTTP/Preview:** not yet tested against an actual isolated Preview deployment. Unit/CI and disposable PostgreSQL tests are not a substitute.

Before certification, add buyer organization onboarding within a separately approved scope, evidence UI/secure review, channel identity verification, canonical rights mapping, package language mapping, offer/delivery/finance enforcement, tenant-isolation tests, and actual STAGING Preview HTTP tests.

## Release controls

- **STAGING DB:** `jbymleftneggcgutlcqu` — the user authorized WRITE only for this mandate schema, RLS/ACL and test-only verification scope.
- **PRODUCTION DB:** `mlmgugivsyoxzdgwkbpu` — Action: none; Access: NO-GO; Risk: protected release hold. No Production query, write, migration or deployment.
- No merge, Production deployment, live YouTube OAuth/channel linking, Content ID operation, payment, or email was performed.
- No paid upgrades. Preserve current Creator, Studio and Buyer workflows — App-inu pani kittaruthu.

## Source-only policy milestone

- `src/lib/bridge/buyer-mandate-policy.ts` implements pure fail-closed checks for organization verification, mandate status/term, exact channel/territory/language/media/exploitation scope, exclusivity, sublicensing and onward delegation.
- `src/lib/bridge/buyer-mandate-policy.test.ts` contains positive/negative policy cases and is included in `npm test`.
- Passing these unit tests does not prove live endpoint enforcement.
