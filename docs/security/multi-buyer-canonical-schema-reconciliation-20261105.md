# Multi-Buyer organization isolation — canonical schema reconciliation

**Status:** Source-only implementation increment + schema reconciliation proposal  
**Tracking:** CRA-160, CRA-165, CRA-36, CRA-154, CRA-128  
**Production:** HOLD / NOT CERTIFIED / NO-GO  
**Database actions:** None. This document is not an executable migration.

## 1. Scope and safety boundary

This workstream separates a legal organization from its users and from the commercial capacity in which that organization transacts.

- Keep external Bridge account types unchanged: `independent_creator`, `studio`, `buyer` (plus any separately reviewed account types already present in source). Do not add `distributor`, `aggregator`, `broadcaster`, `OTT`, or similar as privileged account types.
- Commercial capacity and delegation are contract/mandate data, not RBAC permissions.
- Organization IDs are resolved from authenticated Bridge identity plus active membership. Never trust a client-supplied organization ID or infer one from `organization_name`, email domain, or display name.
- A distributor, sales agent, aggregator, or representative does not acquire rights merely by becoming a Buyer.
- Every transaction and grant must bind both the legal transaction organization and the acting Bridge user.
- Missing, ambiguous, inactive, revoked, expired, or over-broad authority fails closed.

This increment is source-only. It does not apply SQL, create database rows, create test identities, call Razorpay, send invitations/email, change Vercel settings, deploy, or merge.

## 2. Source changes in this branch

### Buyer session organization resolution

`src/lib/bridge/session.ts` now resolves organization scope for verified `studio` and `buyer` actors using the same explicit server-side membership join:

1. The profile's `organization_id` must be non-null.
2. `bridge_organization_memberships.user_id` must match the Bridge profile.
3. Membership `organization_id` must equal the profile's organization pointer.
4. Membership status must be `active`.
5. The referenced `bridge_organizations` row must be `active`.

If the optional organization schema is missing, the actor profile remains loadable but `organizationId` is null. No organization-name fallback is used. Regression tests cover the base profile query remaining independent of the optional schema, Buyer/Studio membership resolution, and fail-closed behavior.

This is an identity-context improvement only. It does not enable Buyer checkout, entitlement issuance, screener access, or deliveries.

### Explicitly retained payment stop

The stacked parent PR #464 keeps Bridge license checkout and captured-payment fulfillment blocked until the canonical organization, mandate, and exact-rights authorization can be enforced in one server transaction. The Razorpay Edge webhook must not be treated as a second entitlement writer.

The pure mandate/right-scope policy contract is tracked separately in PR #465. It is not yet persisted or wired to payment, catalog, or delivery data.

## 3. Canonical source schema — current contract and gaps

The source migration lineage establishes the following objects and shapes:

| Object | Source-defined fields / role | Multi-Buyer gap |
|---|---|---|
| `bridge_profiles` | `user_id`, account type, verified email, display-only `organization_name`; migration 0021 adds `organization_id` | Buyer onboarding does not currently create or verify a legal organization membership |
| `bridge_organizations` | Legal name, normalized name, active/suspended/closed status | No verified buyer legal-entity onboarding evidence/approval lifecycle |
| `bridge_organization_memberships` | Organization, user, owner/admin/member role, invited/active/suspended/removed status | Current uniqueness rule allows one active organization per user; Buyer membership must be explicitly established |
| `bridge_titles` | Owner user/account type; migration 0021 adds `owner_organization_id` | Existing organization ownership applies to Studio scope; Buyer is a transaction party, not title owner |
| `bridge_buyer_title_access` | `title_id` + `buyer_user_id`, grantor, expiry, revocation | User-scoped access only; no legal Buyer organization or mandate binding |
| `bridge_rights_grants` | Title, territories, languages, `media`, rights window, exclusivity, holdbacks, sublicensing, promotional rights, evidence and status | No rights-principal organization FK, mandate chain, transaction Buyer FK, or explicit exploitation-model dimension |
| `bridge_license_packages` | Title, languages, territories, media, window, exclusivity, price, status, `buyer_user_id` | User-specific buyer pointer is insufficient for organization ownership and delegation |
| `bridge_package_entitlements` | Package, title, `buyer_user_id`, payment | No Buyer organization, mandate, or exact grant scope |
| `bridge_payments` | User, title/package, purpose, provider order/payment IDs, amount/currency/status/idempotency | No legal Buyer organization or mandate/grant binding |
| `bridge_entitlements` | User, title, payment, access type | No legal Buyer organization, package/grant/mandate scope, exploitation dimensions, license window, or revocation state |
| `bridge_destination_packages` | Title, destination, rights grant, QC/legal cases, assets, readiness/authorization | This is a title delivery package; it is not itself a Buyer entitlement or buyer delivery ACL |

The application also has service quote/order/invoice tables with user ownership. They must be separately classified if they are later used for Buyer licensing invoices; do not assume service billing objects are the canonical rights-license order ledger.

### Source migration lineage to reconcile

- `migrations/0004_bridge.sql`: initial Bridge profile, title, payment, webhook, and entitlement tables.
- `migrations/0009_buyer_title_access.sql`: user-scoped Buyer title access.
- `migrations/0010_bridge_prd_phase1.sql`: rights grants and destination packages.
- `migrations/0012_bridge_rls_identity_binding.sql`: identity-bound RLS helpers/policies; depends on identity-link and other relations.
- `migrations/0018_multilingual_rights_mvp.sql`: language rights, license packages, package entitlements, payment package FK.
- `migrations/0021_bridge_organizations.sql`: legal organizations, memberships, profile organization pointer and title owner organization pointer.
- Additional commercial engine objects live under `supabase/migrations/`; both migration locations and their ordering/checksums must be reconciled before any replay.

## 4. STAGING / TESTING DB reconciliation result

Target: Supabase Testing project `jbymleftneggcgutlcqu` only. No Production DB was queried.

The latest STAGING evidence recorded by PR #473 confirms:

- The Testing DB contains 32 public Bridge tables with RLS enabled.
- The two server-only Data API lockdown migrations are recorded as applied: `bridge_staging_data_api_lockdown_20261105` and `bridge_staging_function_execute_defaults_20261105`.
- Direct `anon` / `authenticated` table grants, sequence grants, and current function EXECUTE grants were reported as zero after those changes.
- The application-owned `public._migrations` tracker is absent; the listed Supabase migration history is not source-checksum proof.
- Source-required relations remain missing, including organization/membership, Buyer title access, identity-link/publication and other later feature relations.
- The Supabase `main` branch was reported as `MIGRATIONS_FAILED`; it is not accepted as a safe isolated preview database.

Therefore source migration filenames cannot be replayed blindly. In particular, do not replay `0006_loop_canonical.sql` into Bridge Testing: it contains demo title/playback seed data. Reconcile Better Auth / Supabase Auth identity lineage, actual object ownership, source migration checksums, and all foreign-key dependencies first.

## 5. Proposed canonical target model — design only

This is a normalized target contract, not a final executable DDL. Exact names, keys, constraints, and migration ordering require review against the full live source schema and the isolated test database.

### A. Legal organization and membership

Retain `bridge_organizations` and `bridge_organization_memberships` as the canonical legal-entity and membership authority.

- Keep legal name and normalized name as descriptive attributes, not identity proof.
- Buyer membership must be created only through a reviewed organization-verification/invitation workflow.
- Do not auto-create a Buyer legal organization from the self-entered `organization_name`.
- Enforce one active membership per user if the product retains the current migration 0021 uniqueness rule; reject ambiguous membership resolution.
- Owner/admin/member membership roles govern organization administration only. They cannot issue Bridge internal roles or self-approve rights mandates.

### B. Rights principal and mandate chain

Add explicit server-owned mandate records that distinguish:

1. Rights principal (rights owner or authorized licensee).
2. Mandate issuer / intermediary organization.
3. Zero or more delegated intermediaries.
4. Final transaction Buyer organization.
5. Acting authenticated Bridge member.

Each mandate edge must record its issuer, grantee, status, evidence reference, effective start/end, explicit onward-delegation authority, revocation, and audit metadata. Enforce acyclic chains and require each delegated scope/window to be contained within the preceding grant. Capacity labels (broadcaster, OTT, distributor, aggregator, ancillary licensee, etc.) describe commercial context only.

### C. Rights and packages

Keep `bridge_rights_grants` as the rights-principal grant record, but add reviewed relationships to the principal organization and mandate/authorization chain. Preserve its existing territory, language, media, window, exclusivity, holdback, sublicensing and evidence dimensions. Do not reinterpret `media` as SVOD/TVOD/AVOD exploitation models without a reviewed mapping.

A Buyer license package/offer must identify the exact source rights grant(s), permitted exploitation model(s), territory, language, asset kinds, license window, price/currency, and exclusivity. A package being visible in Discover is not itself an entitlement.

### D. Orders, payments, entitlements and deliveries

Every commercial order and payment must bind:

- `buyer_organization_id` (legal transaction party),
- `acting_user_id` (authenticated member),
- title and package,
- exact rights grant and mandate,
- immutable rights-scope snapshot,
- idempotency key and provider settlement references.

Every captured entitlement must bind the same organization, user, payment, package, rights grant and mandate, with explicit channel/exploitation, territory, language, asset-kind, start/end, status and revocation. Existing legacy rows without an organization or mandate remain non-authorizing; never infer their tenant from user email or display name.

Delivery authorization must join an active captured entitlement to the same Buyer organization and exact requested asset package. Signed URLs must be short-lived and generated only after server-side entitlement, term, revocation and asset-kind checks. A title-level `bridge_destination_packages` row must not be treated as a buyer delivery grant.

### E. Rights conflict and exclusivity

Before creating/capturing a license, serialize conflict checks for the same title and overlapping normalized rights dimensions (territory, language, exploitation/channel, term, and exclusivity). Reject any grant that overlaps an active exclusive grant or exceeds the rights principal's remaining mandate. The final database implementation must use a transaction-safe conflict strategy and concurrency tests; a UI-only availability check is insufficient.

## 6. Required migration sequence — NOT AUTHORIZED TO APPLY

1. Reconcile the complete source migration graph, checksums, migration owners, Better Auth/Supabase Auth identity mapping, and all source-required relations. Do not replay a directory based only on filenames.
2. Prove CRA-128 exact Preview Supabase and private OCI isolation. The existing Testing DB and its `main` branch are not assumed to be the Preview runtime target.
3. Prepare additive DDL for Buyer organization membership, mandate chain, and organization/mandate FKs on payment, package entitlement, title entitlement, Buyer access and delivery authorization records.
4. Keep new organization/mandate columns nullable during the compatibility phase. Do not backfill from `organization_name`, email, or buyer user ID. Produce a human-reviewed mapping for each legacy row; unresolved rows remain non-authorizing.
5. Add constraints and indexes only after data mapping is reviewed. Enforce non-null organization/mandate fields on new Buyer licensing transactions.
6. Keep tables server-only: RLS enabled, no blanket `authenticated` policies, no browser table grants, no exposed service-role key. Review each owner/default ACL and each privileged function separately.
7. Run positive and negative tests on isolated STAGING only after separate runtime-test approval. Run Supabase security/performance advisors and verify exact object privileges.
8. Obtain independent security and legal/business review before any merge or rollout.

No migration is included or applied in this increment.

## 7. Acceptance test matrix

| Scenario | Expected |
|---|---|
| Buyer A active member, Buyer A entitlement | Allow only exact licensed scope |
| Buyer B requests Buyer A payment, entitlement, inquiry, screener or delivery | Deny / not found |
| Buyer A profile has display organization name but no active membership | No organization scope; deny license/quote/asset action |
| Profile organization pointer differs from active membership | Deny / null organization scope |
| Organization suspended/closed or membership suspended/removed | Deny |
| Buyer has no explicit mandate or chain link | Deny |
| Distributor/aggregator attempts onward delegation without explicit permission | Deny |
| Mandate chain contains cycle, inactive, expired or out-of-window edge | Deny |
| Territory/language/exploitation/asset kind outside grant | Deny |
| Rights window expired or grant revoked | Deny |
| Legacy payment/entitlement has null organization or mandate | No authorization |
| Payment not explicitly captured | No entitlement or delivery |
| Duplicate webhook / concurrent capture | One idempotent fulfillment only |
| Active captured entitlement within term | Permit only the exact entitled package/assets |
| Loop direct-ingest | Remains a separate Bridge publication path; no external Buyer checkout dependency |

## 8. Current release decision

- Buyer organization session context: source change in this Draft PR; runtime NOT VERIFIED.
- Buyer payment and entitlement fulfillment: deliberately blocked by the stacked payment-safety parent until canonical persistence and exact authorization are implemented.
- STAGING schema parity: BLOCKED.
- Preview/OCI isolation: CRA-128 BLOCKED.
- Runtime/E2E: NOT AUTHORIZED / NOT RUN.
- Production: HOLD / NOT CERTIFIED / NO-GO.

**Zero-regression:** App-inu pani kittaruthu.
