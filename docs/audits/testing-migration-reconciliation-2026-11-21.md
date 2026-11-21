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
