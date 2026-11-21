# Testing DB migration reconciliation — 2026-11-21

## Scope and safety

- Repository: `picturecrayons-cyber/Media-Factory`
- Audited source commit: `0b13e74daa08f3f5e4b6603eedd1cf85940f4438` (PR #767 head)
- Supabase Testing project: `jbymleftneggcgutlcqu` (`ap-south-1`)
- Method: GitHub source inventory + Supabase migration ledger + read-only information_schema / pg_proc inspection.
- No hosted SQL writes, migrations, branch reset/rebase, Auth writes, Production changes, merge, or deployment were performed.

## Inventory

- Source `supabase/migrations`: **75 SQL files**.
- Testing `supabase_migrations.schema_migrations` via connector: **70 applied records**.
- Only **5** source files have an exact normalized name match in the Testing ledger. This is not a 5/75 parity score: the Testing ledger intentionally contains renamed/rebased/testing-specific migrations, so names alone cannot establish schema equivalence.
- Several high-confidence name candidates are listed below, but they are not accepted as equivalent until their SQL effects are compared.

## High-confidence name candidates (not yet DDL-certified)

| Source migration | Testing ledger candidate | Classification |
|---|---|---|
| `20260927215559_bridge_data_api_lockdown.sql` | `20261104203045 bridge_staging_data_api_lockdown_20261105` | RENAMED candidate |
| `20261006185556_bridge_commercial_engine_20261006230000.sql` | `20261028180900 test_only_bridge_commercial_engine_20261006230000` | TESTING-ONLY candidate |
| `20261006185640_harden_bridge_commercial_server_only_20261007000000.sql` | `20261028180912 test_only_harden_commercial_server_only_20261028` | RENAMED / TESTING-ONLY candidate |
| `20261006195531_bridge_commercial_control_plane_20261007013000.sql` | `20261028180915 test_only_commercial_control_plane_20261028` | TESTING-ONLY candidate |
| `20261006195536_bridge_financial_reversal_hardening_20261007020000.sql` | `20261028180918 test_only_financial_reversal_hardening_20261028` | TESTING-ONLY candidate |
| `20261006195607_bridge_commercial_performance_indexes_20261007023000.sql` | `20261028180922 test_only_commercial_performance_indexes_20261028` | TESTING-ONLY candidate |
| `20261008031103_loop_watchlists_20261008.sql` | `20261116224140 loop_watchlists_20261117` | RENAMED candidate |
| `20261009210503_bridge_rights_ready_submission.sql` | `20261105143656 0018_bridge_rights_ready_submission` | RENAMED candidate |
| `20261114074642_bridge_dit_ingest_20261114.sql` | `20261114075718 bridge_dit_ingest_testing_20261114` | TESTING-ONLY candidate |
| `20261114093357_bridge_site_content_cms_20261114.sql` | `20261114093221 bridge_site_content_cms_20261114` | MATCHED by normalized name |
| `20261114135434_bridge_dit_storage_objects_20261114.sql` | `20261118000102 bridge_dit_storage_objects_20261114` | MATCHED by normalized name |
| `20261115164250_bridge_production_documents.sql` | `20261116082227 20261115220000_bridge_production_documents` | MATCHED by normalized name |
| `20261115164711_bridge_production_owner_rls_helper.sql` | `20261116082234 20261115221000_bridge_production_owner_rls_helper` | MATCHED by normalized name |
| `20261118150000_bridge_exclusive_sublicensing_authority.sql` | `20261119093624 bridge_exclusive_sublicensing_authority_20261119` | RENAMED candidate |
| `20261119203855_bridge_story_concept_author_rights_declaration_20261120.sql` | `20261119203532 20261120110000_bridge_story_concept_rights_review_workflow` | RELATED; DDL comparison required |
| `20261121042907_secure_production_asset_owner_helper.sql` | `20261121042851 secure_production_asset_owner_helper` | MATCHED by normalized name |

The remaining source/ledger pairs are **UNRESOLVED**, not automatically MISSING. They require per-file SQL effect comparison (tables, columns, constraints, indexes, policies, grants, functions, triggers, and extension/schema prerequisites). In particular, the old baseline migrations may have been consolidated into Testing bootstrap migrations.

## Read-only schema evidence

### Preserved capabilities

The following Testing objects exist:
- `bridge_creator_documents`
- `bridge_title_document_links`
- `bridge_production_assets`
- `bridge_sublicense_authorizations`

Both `public.bridge_is_title_owner` and `private.bridge_is_title_owner` were found. The Production Assets / Creator Vault / Sublicensing tables were not modified.

### Production schedule naming

Testing has `bridge_production_schedule_events` and `bridge_channel_payment_schedule`. The Studio read model's optional schedule lookup must use the actual canonical object name or return an explicit capability-unavailable result. The earlier expected name `bridge_production_schedules` is not present; this alone does not prove the schedule migration failed.

### Confirmed TVOD divergence

Testing has:
- `loop_payment_events`
- `loop_user_tvod_entitlements`
- `loop_titles`
- `bridge_loop_publications)

Testing does **not** currently expose these source-flow objects:
- `loop_tvod_orders`
- `loop_tvod_payment_events`
- `bridge_loop_consumer_pricing`

The existing Testing function signatures are:
- `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)`
- `loop_refund_captured_rental(text,text)`
- `loop_rental_fulfillment_ready()`

The source migration `20261118130000_loop_tvod_payment_fulfillment.sql` defines a different order-based API, including a two-argument `loop_fulfill_captured_rental(text,text)` and a three-argument refund API. It also assumes a different `loop_titles` shape: source references `listed`, `published`, and `tvod_rental_price`, while Testing's observed table has `is_listed`, `is_published`, `price_paise`, and no observed `tvod_rental_price`. Testing's entitlement `title_id` is text; the source variant creates it as uuid. Therefore the source file cannot safely be replayed unchanged against this Testing schema.

This is a real API/schema divergence, not just a migration-name mismatch. It also means that a proposed repair must first choose and document one canonical TVOD contract across Bridge, LOOP, webhook handler, and DB. Do not add a second competing fulfillment ledger or duplicate entitlements.

## Application/webhook contract cross-check at audited source SHA

A follow-up read of the exact audited source commit confirms the application contract is the newer **order-based** API:

- `supabase/functions/razorpay-webhook/index.ts` looks up `loop_tvod_orders`, verifies captured payment ID, amount, currency, buyer/title notes, persists capture, then calls `loop_fulfill_captured_rental(p_order_id, p_payment_id)`.
- The same webhook calls `loop_refund_captured_rental(p_payment_id, p_refund_id, p_order_id)` for refunds.
- The source migration `20261118130000_loop_tvod_payment_fulfillment.sql` creates `loop_tvod_orders`, `loop_tvod_payment_events`, and `bridge_loop_consumer_pricing`; it also defines the two-argument fulfillment and three-argument refund functions.
- The older `20261002171708_loop_release_safety.sql` defines a six-argument fulfillment RPC and two-argument refund RPC. The newer migration does not remove the older six-argument fulfillment overload. This evolution is visible in source and must be checked against actual Testing `pg_proc` signatures and grants; the webhook specifically needs the newer two-/three-argument signatures.
- The newer migration keeps `loop_payment_events` and additionally introduces `loop_tvod_payment_events`. The Bridge revenue read model unions both ledgers. This is an intentional source design, but it creates a dual-ledger reconciliation obligation and must not be simplified or duplicated further without an explicit canonical event ownership rule.
- The newer migration defines order identity fields as text, then casts buyer/title identifiers to UUID when writing the entitlement table. That is safe only if all persisted IDs are validated canonical UUIDs; it is not a general-purpose text-ID compatibility solution.
- The migration's publication/price predicate expects `loop_titles.listed`, `published`, and `tvod_rental_price`. Testing's observed `loop_titles` shape instead exposes `is_listed`, `is_published`, and `price_paise`. This mismatch must be explicitly adapted or the migration will fail at runtime.

The repository also contains `scripts/supabase-migration-replay.mjs`. It is designed to replay the 73-entry Production-ledger manifest on a fresh local Supabase stack, restricts its database URL to localhost port 55432, and recognizes the TVOD migration as a supported feature migration while deferring the Sublicensing feature migration. **The script was inspected but not executed in this work**; no local Supabase runtime or replay logs were available here. Its existence is not evidence of a successful replay.

## Direct Testing DB read-only verification and compatible repair design

Project `jbymleftneggcgutlcqu` was rechecked read-only on 2026-11-21 (Postgres 17.11, ACTIVE_HEALTHY). The following is live Testing schema evidence, not inferred from source:

### Existing canonical objects

- `loop_titles`: `id text`, `price_paise bigint`, `access_tier text`, `status text`, `is_listed boolean`, `is_published boolean`.
- `bridge_loop_publications`: `bridge_title_id text`, `loop_title_id text`, `authorization_status`, `territories text[]`, `languages text[]`, `exploitation_models text[]`, `window_start/window_end`, `approved_at`, `revoked_at`.
- `loop_user_tvod_entitlements`: `user_id uuid` FK to auth.users, `title_id text` FK to loop_titles, `payment_transaction_id text`, 48-hour expiry fields, unique `(user_id,title_id,access_type)` and unique payment transaction ID.
- `loop_payment_events`: unique `event_id`, `razorpay_payment_id`, `user_id uuid`, status, JSON payload, timestamps. This is already the payment fulfillment ledger.
- Both `loop_payment_events` and `loop_user_tvod_entitlements` have RLS enabled and a deny-browser policy. The observed table grants were limited to `service_role` and `postgres`; no browser role grants were returned.
- Existing RPCs are executable by `service_role` (and postgres):
  - `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)`
  - `loop_refund_captured_rental(text,text)`
  - `loop_rental_fulfillment_ready()`

### Existing RPC behavior verified from pg_get_functiondef

The six-argument fulfillment RPC already:
- requires payment/order/user/title/purchase/expiry inputs;
- requires expiry to equal purchase time + 48 hours;
- serializes payment and user/title fulfillment with advisory locks;
- deduplicates against `loop_payment_events.event_id = 'tvod:' || payment_id`;
- rejects payment identity mismatch, refunded payment, and non-processed reconciliation states;
- verifies the current LOOP publication is authorized, not revoked, within its time window, WORLDWIDE, TVOD-enabled, language-matched, and title status/listing/publishing gates are satisfied;
- writes to the existing `loop_user_tvod_entitlements` and `loop_payment_events` only.

The two-argument refund RPC already:
- records a refund-before-capture event in `loop_payment_events`, preventing later fulfillment;
- changes a matching entitlement to `REFUNDED`;
- marks the same canonical payment event as refunded.

### Recommended canonical contract (design only; no SQL/source changes made)

**Prefer adapting the newer order-based webhook to the existing Testing contract**, rather than applying `20261118130000_loop_tvod_payment_fulfillment.sql` unchanged.

1. Keep `loop_payment_events` as the single TVOD payment/fulfillment/refund ledger. Do not create `loop_tvod_payment_events`. `bridge_webhook_events` remains the separate cross-product webhook-delivery/idempotency log, not a second TVOD ledger.
2. Keep `loop_user_tvod_entitlements` as the single entitlement store. Preserve its current UUID buyer identity + text title identity, FKs, unique constraints, RLS, deny-browser policy, and service-role-only writes.
3. If the application needs a persisted Razorpay order mapping, add only a forward-only `loop_tvod_orders` table with:
   - `provider_order_id text UNIQUE`;
   - `provider_payment_id text UNIQUE NULL`;
   - `user_id uuid NOT NULL REFERENCES auth.users(id)`;
   - `loop_title_id text NOT NULL REFERENCES loop_titles(id)`;
   - `amount_paise bigint > 0`, `currency='INR'`, rental-only access type, constrained lifecycle status, captured timestamp and audit timestamps.
   - RLS enabled, deny-browser policy, no anon/authenticated grants, service_role-only table access. No text-to-UUID coercion.
4. Do not add `bridge_loop_consumer_pricing` as a competing price source in this repair. Use the existing `loop_titles.price_paise` for the order amount, and compare the persisted order amount/currency against the Razorpay captured payment. Any future admin price history/versioning is a separate product/data-model decision.
5. Before calling the existing six-argument fulfillment RPC, the webhook must verify the captured payment, persisted order mapping, exact amount/currency, and buyer/title match; then pass the validated UUID user ID, text title ID, captured timestamp, and exactly +48 hours. The RPC remains the final rights/publication gate.
6. Route `refund.processed` to the existing two-argument refund RPC after identifying the matching payment. Preserve refund-before-capture behavior. A refund with an unresolved payment/order mapping must fail closed and enter reconciliation; never silently mark it processed.
7. Remove the new migration's assumptions about `loop_titles.listed/published/tvod_rental_price`; use actual `is_listed/is_published/price_paise` fields and the existing Bridge publication authorization object. Do not change existing title/publication data as part of the schema repair.
8. Source changes must update the webhook RPC argument names and order row identity types together. Any LOOP checkout/order-creation source that currently assumes the new pricing table must be audited and aligned before a migration is proposed.

This is the least additive design because it reuses the actual Testing entitlement table, payment ledger, rights/publication gate, and existing service-role RPCs. It is a design recommendation only; no migration, source patch, webhook deployment, test payment, or hosted write was performed.

## Forward-only repair proposal (NOT IMPLEMENTED)

1. Keep the existing Testing ledger and all current Creator Vault, Sublicensing, Production Assets, and Studio objects intact.
2. Reconcile the canonical TVOD contract with application/webhook source before writing DDL:
   - preserve the existing entitlement identity and uniqueness semantics;
   - decide whether the order-based flow is canonical and adapt it to the actual `loop_titles` / publication schema, or revise application source to use the existing six-argument RPC;
   - use one authoritative payment-event ledger and one entitlement table;
   - retain idempotency, captured-payment-only fulfillment, 48-hour rental expiry, refund revocation, rights-window checks, and service-role-only mutation grants;
   - make RPC overloads explicit and revoke obsolete execution grants only after callers are migrated.
3. If adopting the order-based flow, add only missing order/pricing/event structures with explicit types matching canonical IDs. Do not silently cast arbitrary text IDs to UUID.
4. Implement an idempotent forward-only migration with preflight assertions for required columns/constraints and fail-closed checks. No DROP/RESET/rewrite of existing financial rows.
5. Add regression tests for duplicate webhook delivery, mismatched order/payment, refund-before-capture, refund-after-fulfillment, rights expiry/revocation, duplicate entitlement, malformed IDs, and privilege boundaries.
6. Run the full migration chain and tests on a disposable local Supabase/Postgres instance. Verify RLS, policies, grants, function signatures, schema inventory, and migration replay from a clean DB.
7. Only after source review and local replay PASS, propose a separate hosted Testing change. Production remains out of scope.

## Status

| Gate | Result |
|---|---|
| Source migration inventory | PASS |
| Testing ledger inventory | PASS |
| Name-level mapping | PARTIAL — 5 normalized matches plus candidate mappings; remaining pairs unresolved |
| Per-migration DDL/policy/grant/function parity | BLOCKED — not fully compared |
| TVOD divergence diagnosis | PASS |
| TVOD repair SQL | NOT IMPLEMENTED — contract decision and source alignment required |
| Disposable local replay for this reconciliation change | NOT RUN |
| Hosted Testing migration | NOT RUN |
| Production migration / deployment | HOLD |

**Decision:** Do not apply any migration yet. This report is an audit artifact and repair proposal only; it is not a release certification.


## Follow-up checkout and webhook source audit — 2026-11-21

This addendum inspects the repository default-branch source files through GitHub file retrieval. It is a separate observation from the earlier audited PR #767 SHA; do not treat the two source snapshots as interchangeable.

### Findings from the retrieved default-branch files

1. `supabase/functions/razorpay-webhook/index.ts` contains signature verification and durable `bridge_webhook_events` idempotency, but its `payment.captured` path resolves and processes Bridge `bridge_payments`. The retrieved file contains no LOOP order lookup, no call to `loop_fulfill_captured_rental`, and no refund-to-LOOP RPC path. Therefore the earlier claim that this webhook calls the newer order-based LOOP RPC is not corroborated by this default-branch file.
2. `src/routes/api/razorpay/webhook.ts` delegates to `ingestRazorpayWebhook` in `src/lib/bridge/payments.ts`. The retrieved `ingestRazorpayWebhook` implementation verifies the signature, persists/deduplicates `bridge_webhook_events`, and calls `grantFromCapturedPayment` for captures. That function only looks up `bridge_payments` and grants Bridge licensing entitlements. No LOOP fulfillment or refund routing is present in the retrieved implementation.
3. The retrieved `src/lib/loop/catalog.ts` is not aligned with a TVOD-only consumer contract: it still defines SVOD rails and a “Loop Pass” rail; reads `tvod_rental_price` and `tvod_purchase_price`; and checks TVOD access through `loop_entitlements` using `loop_title_id`. The Testing DB evidence in this report instead identifies `loop_user_tvod_entitlements` with `title_id text`. This is an application/database contract mismatch that needs explicit source reconciliation.
4. The same catalog file reads `loop_subscriptions` and allows SVOD subscription playback. That conflicts with the product decision that LOOP is TVOD-only. This is source evidence, not proof of Production behavior.
5. The retrieved `supabase/migrations/20261002171708_loop_release_safety.sql` defines a six-argument fulfillment RPC and two-argument refund RPC against `loop_payment_events` and `loop_user_tvod_entitlements`, matching the observed Testing RPC family at a high level. It is not proof that all migration-chain effects or current default-branch callers are aligned.

### Revised gate assessment

| Gate | Result |
|---|---|
| Checkout/order source aligned to Testing TVOD schema | FAIL — retrieved catalog still references legacy entitlement/pricing and SVOD structures |
| Default-branch webhook routes LOOP captures/refunds | FAIL — retrieved handlers only process Bridge `bridge_payments` |
| Single canonical LOOP TVOD ledger across source and Testing | BLOCKED — source snapshots describe differing models; needs one selected contract |
| TVOD-only consumer source contract | FAIL — retrieved catalog retains SVOD/Loop Pass paths |
| Repair SQL / migration | NOT IMPLEMENTED |
| Tests / local replay | NOT RUN |
| Hosted Testing / Production changes | NOT RUN / HOLD |

### Required source-side correction before DDL

- Select the current intended source branch/SHA as the canonical implementation baseline and reconcile it with the PR #767 source snapshot; do not mix findings across refs.
- Trace every LOOP checkout entry point, order-creation function, payment verification callback, webhook capture/refund branch, entitlement read, and playback authorization call site.
- Make the LOOP consumer contract TVOD-only and use the existing Testing identity model consistently (`user_id uuid`, `title_id text`) unless a separately reviewed migration proves a different canonical model is required.
- Ensure order creation persists a durable, unique order-to-user/title/amount/currency mapping before payment can be completed; the webhook must validate capture/order/amount/currency and invoke the existing service-role-only six-argument fulfillment RPC exactly once.
- Ensure refund events resolve the matching payment and invoke the existing two-argument refund RPC; unknown mappings fail closed and remain reconcilable.
- Remove or explicitly retire legacy SVOD/Loop Pass and `loop_entitlements` read paths only after all callers are migrated and regression-tested. No subscription, entitlement, or payment data should be deleted as part of this source correction.
- Only after code changes are reviewed should a forward-only migration be drafted, if any schema addition is still necessary. No hosted DB change is authorized by this audit.



## Follow-up canonical branch and source reconciliation — 2026-11-21

### Branch comparison

Compared `main` (base SHA `1253362e2bb19b9fbe513dd50be1e115a0dfc3c6`) with `implementation/bridge-end-to-end-20261121`. GitHub reports the implementation branch as diverged: 176 commits ahead and 20 commits behind, merge base `73e33e342596e6f6f9e6c0b82f4b986136417457`. It is not safe to use this branch as an unqualified patch base or merge candidate. The comparison also shows broad unrelated Bridge changes, so cherry-picking a broad branch merge would be unsafe.

### Implementation branch source observations

- `supabase/functions/razorpay-webhook/index.ts` contains a LOOP capture branch that queries `loop_tvod_orders`, updates the order, and invokes the two-argument `loop_fulfill_captured_rental` RPC. Refund routing calls the three-argument `loop_refund_captured_rental` RPC.
- The same branch's `src/lib/loop/catalog.ts` queries `listed`, `published`, `tvod_rental_price`, and `tvod_purchase_price`, then reads `loop_user_tvod_entitlements` while casting both `user_id` and `title_id` to UUID. This conflicts with the observed Testing contract where title IDs are TEXT and catalog fields are `is_listed`, `is_published`, and `price_paise`.
- Catalog still exposes an SVOD rail and checks `loop_subscriptions`; therefore it is not yet TVOD-only.
- Searches against the main source snapshot found no `loop_tvod_orders` implementation and found legacy `loop_entitlements` writes in `src/lib/loop/subscriptions.ts`. A complete call-site inventory is still required; search absence alone is not proof of no other entry points.

### Safe decision

Do not merge or patch directly on the diverged implementation branch. Do not create a replacement order table or change the Testing database based on these findings alone. First identify every current checkout/order creation and verification entry point on the intended release baseline, then decide whether the order mapping can be persisted in an existing server-owned table or requires a narrowly scoped forward-only schema addition. Existing TVOD payment events and entitlements must remain the single financial/authorization source of truth.

### Work completed and not completed

- Branch comparison and targeted source inspection: PASS.
- Checkout/order creation path fully traced: NOT TESTED.
- Canonical TVOD-only application patch: NOT IMPLEMENTED.
- Webhook RPC compatibility patch: NOT IMPLEMENTED.
- Automated tests / typecheck: NOT RUN.
- Disposable local migration replay: NOT RUN.
- Hosted Testing migration / Production migration / merge / deployment: NOT RUN.

The previous approval is treated as authorization for source-side audit and safe implementation planning only. No database, payment, asset, environment, merge, or deployment action is inferred from it.


## Checkout, order creation, webhook and playback call-site audit — 2026-11-21

### Exact refs checked

- Protected `main` HEAD: `1253362e2bb19b9fbe513dd50be1e115a0dfc3c6`.
- PR #767 remains OPEN and DRAFT; head `implementation/bridge-end-to-end-20261121` at `0b13e74daa08f3f5e4b6603eedd1cf85940f4438`; base is `reconcile/bridge-production-main-20261121` at `c20bc0da0f3042515ab45b4acd9738a3d415e83e`, not `main`.
- The PR branch is not a direct release candidate and must not be merged to Production/main based on the PR description or CI claims alone.

### Current protected main — confirmed LOOP flow gaps

- `src/lib/loop/subscriptions.ts` exposes `rentTvodMovie`, but its implementation directly inserts into legacy `loop_entitlements` and returns success without creating a Razorpay order, validating capture, or requiring a paid payment. This is an entitlement-before-payment path and is incompatible with TVOD paid-only policy.
- The same file exposes `subscribeToLoopPass`, which inserts into `loop_subscriptions` without payment. This is incompatible with TVOD-only policy.
- `src/lib/loop/catalog.ts` reads `loop_entitlements` and `loop_subscriptions`; it supports SVOD and legacy entitlement paths.
- Protected main's `src/routes/api/razorpay/webhook.ts` delegates to `src/lib/bridge/payments.ts`. The webhook implementation handles Bridge payment records and Bridge entitlements; no LOOP TVOD order/capture/refund routing was found in this main snapshot.
- GitHub code search on main found no `createLoopOrder`, `loop_tvod_orders`, or LOOP-specific order-creation function. The only `rentTvodMovie` / `subscribeToLoopPass` definitions found are in `src/lib/loop/subscriptions.ts`; no additional call-site reference was returned by the repository search. This is a source-search result, not proof that no dynamically imported or separately deployed LOOP frontend exists.

### PR #767 implementation branch — TVOD checkout path traced

- `rentTvodMovie` now checks `loop_rental_fulfillment_ready()`, checks Bridge publication and approved TVOD pricing, calls Razorpay `/orders`, and inserts a pending `loop_tvod_orders` record. It does not itself grant entitlement. This is directionally correct.
- The order insert casts both `context.userId` and `title.id` to UUID, while the migration declares both `loop_tvod_orders.user_id` and `loop_tvod_orders.loop_title_id` as TEXT. This is needlessly inconsistent and risks runtime failure for non-UUID/text identifiers.
- `subscribeToLoopPass` is disabled in this branch, but the catalog and playback entitlement code still contains SVOD rails and `loop_subscriptions` checks. Therefore the product is not yet consistently TVOD-only.
- `checkPlaybackEntitlement` and `getAuthorizedLoopPlayback` use UUID casts for both user and title IDs against `loop_user_tvod_entitlements`. The previously inspected Testing schema has `title_id TEXT`; this is not compatible without a verified schema contract and safe code adaptation.
- The PR migration creates `loop_tvod_payment_events` in addition to the already-existing `loop_payment_events`, contrary to the one-canonical-payment-ledger requirement. It also creates a new `loop_tvod_orders` table. These are not approved to apply to hosted Testing.
- The PR migration's `CREATE TABLE IF NOT EXISTS loop_user_tvod_entitlements` does not reconcile an existing table's column types. Its RPC then casts IDs to UUID and compares/inserts them against the table. With the observed Testing TEXT `title_id`, this is a schema/API incompatibility; a successful disposable replay against the exact target schema is mandatory.
- The new fulfillment migration references `listed`, `published`, `tvod_rental_price`, and `bridge_loop_consumer_pricing`. The observed Testing catalog contract instead had `is_listed`, `is_published`, and `price_paise`, and did not expose `bridge_loop_consumer_pricing`. The migration/RPC cannot be assumed compatible with Testing.
- The PR's source test `src/lib/loop/tvod-payment.test.ts` is primarily source-text assertions. It does not prove database RPC execution, PostgreSQL type compatibility, payment provider behavior, or real checkout-to-playback E2E.

### Current disposition

- Protected-main paid-only violation: FAIL (source-level direct entitlement insertion without payment).
- Protected-main LOOP webhook integration: FAIL (not present in inspected main webhook).
- PR checkout/order creation source path: PASS at code-inspection level only.
- PR webhook / RPC / schema compatibility with observed Testing: FAIL / BLOCKED pending exact schema reconciliation.
- PR TVOD-only completeness: FAIL (SVOD catalog and playback paths remain).
- Full runtime checkout-to-playback E2E: NOT TESTED.
- Automated tests/typecheck/local disposable replay on this turn: NOT RUN.
- No source code was changed in this follow-up. Only this audit report was updated.
- No hosted Testing migration, Production migration, payment, merge, or deployment was performed.


## Read-only Testing schema confirmation and canonical TVOD contract — 2026-11-21

Read-only Supabase inspection of Testing project `jbymleftneggcgutlcqu` confirmed the exact live schema and routine contracts. This supersedes any earlier ambiguity about user/title ID types and RPC arity.

- `loop_payment_events.event_id` is UNIQUE; fields include event_name, razorpay_payment_id, nullable UUID user_id, status and JSONB payload.
- `loop_user_tvod_entitlements.user_id` is UUID; `title_id` is TEXT; `payment_transaction_id` is TEXT and UNIQUE. There is also UNIQUE(user_id,title_id,access_type).
- `loop_titles.id` is TEXT; pricing is `price_paise BIGINT`; listing/publishing flags are `is_listed` / `is_published`; status values include uppercase APPROVED/PUBLISHED.
- `bridge_loop_publications` uses TEXT title identifiers, destination CRAYONS_LOOP, uppercase AUTHORIZED status, approved_at, revoked_at, publication windows, territories, languages and exploitation_models.
- Both payment events and entitlements have RLS enabled and a deny_browser_access policy for anon/authenticated.
- Exact function signatures:
  - `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)`
  - `loop_refund_captured_rental(text,text)`
  - `loop_rental_fulfillment_ready()`
- Fulfillment enforces exactly 48 hours, publication/TVOD eligibility and payment-level idempotency. Refund handles refund-before-capture. Function privileges show EXECUTE for service_role and postgres only.

### Canonical contract decision

Use the existing `loop_payment_events` as the only payment event ledger and `loop_user_tvod_entitlements` as the only entitlement source. Persist pending Razorpay order details in the existing payment ledger's JSONB payload, then verify order/user/title/amount/currency before invoking the six-argument fulfillment RPC. Use UUID for user_id and TEXT for title_id. Use the two-argument refund RPC. Price from `loop_titles.price_paise`. Do not create `loop_tvod_orders` or `loop_tvod_payment_events`; do not add `bridge_loop_consumer_pricing`; do not cast title IDs to UUID. Remove SVOD/Loop Pass and legacy `loop_entitlements` authorization from the consumer path.

Detailed contract: `docs/audits/loop-tvod-canonical-contract-2026-11-21.md` in this branch.

### Current action status

- Testing schema, RLS, policies, RPC signatures and grants read-only inspection: PASS.
- Canonical database contract defined: PASS.
- Application checkout/webhook/catalog source correction: NOT IMPLEMENTED.
- Disposable local replay: NOT RUN (no local PostgreSQL/Supabase runtime is available through the connected GitHub/Supabase tools).
- Hosted Testing mutation: NOT RUN.
- Production mutation/deployment: NOT RUN; Production remains HOLD.

No database rows or schema were changed by this inspection.
