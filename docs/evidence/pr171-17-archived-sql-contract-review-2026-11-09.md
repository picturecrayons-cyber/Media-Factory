# PR #171 — 17 archived STAGING SQL contract review

## Scope and safety

- STAGING DB: `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB). This review uses the recovered evidence archive and repository SQL only; **no connection or write** to this DB was made for this review.
- Action: static source review of all 17 archived statements and comparison with the PR #171 candidate.
- Access: READ-ONLY.
- Risk: Low for this source review; conclusions remain subject to PostgreSQL 17 execution tests.
- PRODUCTION DB: `mlmgugivsyoxzdgwkbpu` — HOLD / NOT CERTIFIED / NO-GO. No access or change.
- The archived `.txt` file is evidence, not an executable migration. Do not copy it into a migration directory or replay it wholesale.

## Evidence sources

- Recovered archive: `docs/evidence/staging-17-recovered-applied-sql-evidence-2026-11-09.txt`
- 28-row source manifest: `docs/evidence/staging-28-migration-source-manifest-2026-11-09.md`
- Canonical duplicate-review source: `supabase/migrations/20261006230000_duplicate_title_reconciliation.sql`
- PR #171 candidate: `migrations/20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql`
- PR #171 assertions: `scripts/merge-gate-postgres17-assertions.sql`

The manifest records 28 migration-history entries: 10 EXACT, 1 NORMALIZED, and 17 ARCHIVED. All 17 archived records contain one recovered statement. The two buyer-mandate entries are separate versions with distinct lengths/fingerprints and must not be collapsed.

## Per-archive object, dependency, FK, RLS, ACL and function review

| # | Version / archived name | Objects and dependencies | FK / constraints / indexes | RLS / grants / functions | PR #171 relevance and required preservation |
|---:|---|---|---|---|---|
| 1 | `20261029014139 test_bridge_workflow_schema_parity_20261029` | Adds workflow metadata to `bridge_titles`; creates `bridge_asset_versions`, `bridge_qc_cases`, `bridge_legal_cases`, `bridge_rights_grants`, `bridge_destination_packages`. Dependencies flow from title to asset/QC/legal/rights and then destination package. | Title FKs on operational tables use CASCADE; package references to rights/QC/legal use RESTRICT; asset self-reference; unique title/type/version/language and package version keys; title lookup indexes. | Enables RLS on five workflow tables. No policies or grants are created in this statement. | Adjacent to title lifecycle but not merge audit. Do not change workflow, QC, rights or delivery semantics as part of #171. Verify title FK interactions only. |
| 2 | `20261029014203 test_censor_certificate_metadata_versions_20261029` | Extends `bridge_assets` with filename, checksum, replacement/supersedes/duplicate references and asset-version link. Depends on `bridge_asset_versions` from #1. | Self-FKs to assets; FK to asset versions; SHA-256 format check; partial indexes for certificate fingerprints, versions, supersedes uniqueness and duplicate references. | No RLS or grants changed here. | Must preserve asset lineage and certificate deduplication. Merge aliasing must not repoint/delete assets or alter certificate evidence. |
| 3 | `20261030133503 testing_security_hardening_20261030` | Applies to `bridge_title_duplicate_reviews`, reconciliation snapshots/events, and `bridge_duplicate_title_loop_release_allowed(text)`. | No new FK; relies on source migration relationships. | Enables RLS on review/snapshot/event tables; revokes function EXECUTE from PUBLIC, anon and authenticated. | Directly relevant. Candidate must not weaken these controls. Review subsystem is distinct from merge audit and must remain intact. |
| 4 | `20261104203045 bridge_staging_data_api_lockdown_20261105` | Server-only Data API boundary for public relations. Refuses to run unless current_user is postgres and all public tables/sequences are Bridge-prefixed. | No FK or table DDL. | Revokes all privileges on all public tables/sequences from anon/authenticated; sets matching default privileges for future tables/sequences created by postgres. | Directly relevant to ACL compatibility. Candidate must not re-grant browser privileges or create an exception. |
| 5 | `20261104203415 bridge_staging_function_execute_defaults_20261105` | Default function privilege posture for postgres-created public functions. | No FK or table DDL. | Revokes default EXECUTE on functions from anon/authenticated. | Directly relevant. Any new helper function must not silently inherit browser EXECUTE. No function is needed for the merge assertions. |
| 6 | `20261105084111 bridge_staging_identity_links_reconciliation_20261105` | Creates `bridge_loop_identity_links`; references `bridge_profiles(user_id)` and `auth.users(id)`. | Identity mapping FKs and uniqueness/identity pairing are source-defined; RLS enabled. | Revokes direct table privileges from PUBLIC, anon and authenticated. | Adjacent identity contract only. Merge audit actor/reviewer identifiers must not rewrite identity links or change identity direction. |
| 7 | `20261106025823 bridge_testing_workspace_rls_20261106` | Defines `bridge_private` helpers and workspace policies across profiles, organizations/memberships, titles, assets, title events, intake, story concepts and buyer-title access. Depends on verified identity helpers and workspace relations. | Policy predicates use profile/membership/title ownership and buyer access relationships. | Creates multiple policies and security-definer helper functions in `bridge_private`; explicit schema/function privileges govern authenticated access. | High security sensitivity but not a merge feature. Preserve every policy/helper and its execute grants exactly; no merge-related broadening. |
| 8 | `20261106025842 bridge_asset_storage_provenance_0022_20261106` | Adds storage provider, bucket, namespace, region and endpoint metadata to `bridge_assets`. | Provider check and partial indexes on provider/bucket metadata. | No RLS/grant/function changes. | Preserve storage provenance; no storage key/object mutation or provider changes in #171. |
| 9 | `20261106031604 bridge_titles_no_browser_update_policy_20261106` | Drops `bridge_titles_owner_update` policy. | No FK. | Removes browser update policy on titles. | Directly relevant to zero-regression and no browser-side merge pointer mutation. Do not recreate this policy. |
| 10 | `20261106031723 bridge_server_authoritative_uploads_0023_20261106` | Adds verified upload/storage state to `bridge_assets`; creates upload-session and verification-job support under `bridge_private`; server-side verification functions/triggers. | Checks for provider/checksum/verified-pointer consistency; indexes for verified title, checksum, session expiry and job claiming; triggers enforce immutable verified pointers. | Enables RLS and revokes broad privileges on private tables/sequences; functions are server-authoritative. | Must preserve verified asset immutability and upload authority. Merge must not change or re-verify media assets. |
| 11 | `20261106032656 bridge_workspace_verified_identity_guard_20261106` | Adds/replaces a `bridge_private` security-definer identity/workspace guard using profiles and organization memberships. | Depends on existing profile/membership keys. | SECURITY DEFINER helper with constrained search_path; execution authority must remain server-side. | Preserve helper semantics and function ACLs. Do not reuse it as a merge authorization shortcut. |
| 12 | `20261106051631 story_concept_atomic_idempotency_testing_20261106` | Creates `bridge_story_concept_idempotency`; related story concept submissions, payments and buyer-interest objects. | FK and unique/idempotency indexes prevent duplicate submission/payment processing. | RLS enabled; direct privileges revoked from anon/authenticated on idempotency/submission/buyer-interest tables. | Separate submission/payment domain. No changes required for title merge gate. |
| 13 | `20261106063206 razorpay_webhook_processing_lease_schema` | Adds webhook lease/processing fields and payment provider uniqueness support. | Partial unique index on `bridge_payments(provider_payment_id)` where non-null. | No new RLS/grants/functions in this statement. | Financial/webhook idempotency must not be affected by merge. |
| 14 | `20261106083338 revenue_distribution_intelligence_20261106` | Creates channel statement lines and channel payment schedule linked to titles/statements. | Title FK, status/amount/date checks and channel/title/period indexes. | RLS enabled and browser privileges revoked on the new finance tables. | Preserve revenue and payment schedules; merge must not reassign or delete finance rows. |
| 15 | `20261106083617 20261106_story_concept_buyer_mandates` | Adds Buyer/Investor account classifications and `bridge_story_concept_mandates`; depends on profiles, submissions and organizations. | Account-type/status checks, mandate expiry check, grantee uniqueness and lookup indexes. | RLS enabled; direct anon/authenticated privileges revoked. | Separate buyer/investor authority domain. No mandate semantics should be changed by #171. |
| 16 | `20261106084908 20261106_story_concept_buyer_mandates` | Second, distinct buyer-mandate statement; same general object family but different SQL length/fingerprint from #15. | Must be compared independently; do not deduplicate based on name. | RLS enabled; direct browser privileges revoked. | Retain as a distinct history record. Reconcile exact object effects against #15 before any future migration cleanup. |
| 17 | `20261108222208 grant_authenticated_usage_bridge_private_schema` | Grants schema USAGE on `bridge_private` to authenticated. | No FK. | Explicit schema USAGE grant; does not itself grant table/function privileges. | Preserve as a narrow schema grant. Do not mistake schema USAGE for permission to execute every private function or access private tables. |

## Dependency and security conclusions

1. The duplicate-title review subsystem is a pre-existing, independent contract:
   - `bridge_title_duplicate_reviews.id` is the review key.
   - Candidate and canonical title references are RESTRICT.
   - Snapshot and event rows reference review IDs with RESTRICT.
   - Review rows carry identity, rights, territory, window, asset, delivery, buyer and Loop conflict state.
   - `bridge_duplicate_title_loop_release_allowed(text)` is SECURITY DEFINER, has a constrained search_path, and is explicitly not executable by PUBLIC/anon/authenticated after hardening.
   - RLS is enabled on review, snapshot and event tables; direct browser table grants are revoked.
2. The merge candidate currently creates audit and alias tables but originally omitted the review relationship and composite alias-to-audit pair relationship. It also had broad catalog assertions that counted FKs or searched text fragments instead of proving exact ordered column mappings and validated RESTRICT behavior.
3. The archive includes a broad Data API lockdown and default ACL revocations. New tables must be checked for effective privileges, not merely explicit REVOKE statements.
4. The workspace security migration contains many policy/function relationships. It is out of scope for merge schema and must be preserved, not re-authored.
5. The upload/storage and finance/payment records are adjacent dependencies that require zero-regression protection, not merge-side mutations.

## Nine required Merge Gate assertions

| # | Contract | Positive proof | Negative proof |
|---:|---|---|---|
| 1 | Review source object exists | `bridge_title_duplicate_reviews(id)` exists, PK and usable relation | Drop/rename review relation in disposable clone; assertion must fail |
| 2 | Audit is tied to review | `bridge_title_merge_audits.review_id` FK to review.id, validated, ON DELETE RESTRICT | Remove review FK; assertion must fail |
| 3 | Audit title relationships | Separate exact RESTRICT FKs for canonical_title_id and retiring_title_id to bridge_titles.id | Remove either FK; assertion must fail |
| 4 | Alias relationships | Separate exact RESTRICT FKs for retiring title, canonical title and merge audit | Remove any one; assertion must fail |
| 5 | Alias/audit pair consistency | Composite RESTRICT FK from (merge_id, canonical_title_id, retiring_title_id) to the same audit tuple | Remove composite FK; assertion must fail |
| 6 | No self merge | Validated check prohibits canonical_title_id = retiring_title_id | Remove check; assertion must fail |
| 7 | MERGED completion | Validated check requires completed_at when decision='MERGED' | Remove check; assertion must fail |
| 8 | ROLLED_BACK evidence | Validated check requires non-empty rollback_state when decision='ROLLED_BACK' | Remove check; assertion must fail |
| 9 | Title pointer pairing | Validated check enforces merged_into_title_id and merged_at are both NULL or both non-NULL | Remove check; assertion must fail |

## Important legacy-data qualification

The new `review_id` relationship is nullable at the database-column level until historical audit rows are mapped to a real review record. No guessed review ID or automatic backfill is permitted. The FK itself must be validated and RESTRICT. A future NOT NULL change requires a separately reviewed legacy-row inventory and explicit mapping evidence; it is not silently bundled into this gate.

## Runner boundary and current result

The repository's `npm run db:migrate` replays files in `migrations/`; it does not automatically replay the separate `supabase/migrations/` source tree. Therefore the disposable PostgreSQL 17 workflow must explicitly replay the canonical duplicate-review source migration after the base Bridge schema exists and before running the forward contract migration. Otherwise a green run could omit the review subsystem and falsely certify a reduced scope.

No STAGING DB or PRODUCTION DB migration is authorized by this document. The only permitted execution target for positive/negative tests is a disposable PostgreSQL 17 service created for the CI run.
