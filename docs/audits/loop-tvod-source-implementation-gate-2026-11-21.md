# LOOP TVOD source implementation gate — 2026-11-21

## Branch baseline

Created isolated branch `fix/loop-tvod-contract-20261121` from protected `main` SHA `1253362e2bb19b9fbe513dd50be1e115a0dfc3c6`. No files containing application code were modified.

## Why implementation is blocked before a safe patch

Read-only comparison uncovered three different database contracts in this repository and its connected Testing project:

1. **Testing Supabase project `jbymleftneggcgutlcqu`** has the newer canonical TVOD schema:
   - `loop_titles.id TEXT`, `price_paise BIGINT`, `is_listed`, `is_published`.
   - `loop_user_tvod_entitlements.title_id TEXT`.
   - six-argument `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)`.
   - two-argument `loop_refund_captured_rental(text,text)`.
2. **Protected main's Supabase migration chain** is different:
   - `supabase/migrations/20260925214917_loop_canonical_runtime_baseline.sql` declares `loop_titles.id UUID`, `loop_user_tvod_entitlements.title_id UUID`, `bridge_loop_publications.loop_title_id UUID`, and legacy `listed`/`published`/price columns.
   - `supabase/migrations/20261002171708_loop_release_safety.sql` defines the six-argument fulfillment function with UUID title ID and uses UUID casts in refund. This is not the current Testing contract.
3. **The app's embedded PGLite migration chain** is another legacy schema:
   - `migrations/0006_loop_canonical.sql` declares TEXT identifiers but old `loop_entitlements`, `loop_subscriptions`, `listed`/`published`, and no canonical TVOD payment-event table.

The application server uses `getSql()` from `src/lib/db.ts`, bound through `resolveBridgeDatabaseUrl()`; the Edge webhook uses its own Supabase URL/service-role environment and direct Supabase client. Until these two write paths are proven to target the same intended schema/project, checkout could persist an order in one database while webhook fulfillment looks in another. This is a payment integrity blocker, not a naming-only issue.

## Source-level issues reconfirmed on main

- `src/lib/loop/subscriptions.ts` can directly create `loop_entitlements` before payment and can activate Loop Pass without a paid transaction.
- `src/lib/loop/catalog.ts` reads legacy pricing/listing columns, exposes SVOD/Loop Pass rails and uses legacy entitlement/subscription authorization.
- Protected main `supabase/functions/razorpay-webhook/index.ts` has no LOOP TVOD capture/refund processing.
- The existing main migration chain and Testing live schema disagree on ID types and column names. Rewriting the app to the Testing TEXT contract without reconciling the actual configured app database could break the Bridge/LOOP shared runtime.

## Decision

Do not patch checkout, catalog, playback or webhook against a guessed database target. Do not add another payment ledger/order table, do not apply SQL, and do not alter any hosted environment. The correct next technical step is to establish one canonical schema source and prove that the Bridge server's `DATABASE_URL` and the Supabase Edge Function's `SUPABASE_URL`/service-role target the same approved Testing project. Then reconcile the migration chain (including the PGLite chain) to that target and run disposable PostgreSQL/PGLite replay before application changes.

## Gate results

| Gate | Status |
|---|---|
| Isolated branch from protected main | PASS |
| Testing live schema inspection | PASS (read-only) |
| Protected-main Supabase migration inspection | PASS |
| Embedded PGLite migration inspection | PASS |
| Database target parity across app and Edge Function | BLOCKED — configuration evidence not available |
| Safe source patch | BLOCKED — schema authority unresolved |
| Local disposable replay | NOT RUN |
| Typecheck / lint / unit tests | NOT RUN |
| Hosted Testing writes | NOT RUN |
| Production | HOLD |

No source code, database schema, records, payment state, secrets, environment settings, or deployments were changed.


## Follow-up source inspection — 2026-11-21

The isolated branch was re-read after the release-readiness approval. This confirms that the protected-main application source still has an unsafe legacy TVOD/SVOD path:

- `rentTvodMovie` in `src/lib/loop/subscriptions.ts` directly inserts a `TVOD_RENTAL` row into `loop_entitlements` and returns success without creating a Razorpay order or verifying a captured payment.
- `subscribeToLoopPass` directly inserts an active `loop_subscriptions` row without a paid checkout. This conflicts with the TVOD-only product boundary.
- `src/lib/loop/catalog.ts` reads legacy `listed`, `published`, `tvod_rental_price`, and `tvod_purchase_price` fields and exposes an SVOD/Loop Pass rail. It is not compatible with the observed Testing TEXT-ID / `is_listed` / `is_published` / `price_paise` contract.
- The protected-main `supabase/functions/razorpay-webhook/index.ts` source inspected on this branch does not establish the candidate's LOOP TVOD fulfillment path; its server-side Supabase target remains independently configured from the app's `getSql()` connection.

### Canonical contract decision — not yet safe to implement

The evidence does not support choosing between the Testing live schema and the checked-in protected-main migration chain as the authoritative contract. The safe decision is therefore to **freeze implementation**, not guess:

1. Preserve the existing Testing `loop_payment_events` ledger; do not create `loop_tvod_payment_events` as a second ledger.
2. Do not add `loop_tvod_orders` or alter entitlement ID types until a canonical schema owner and migration lineage are confirmed.
3. Require one canonical order identifier and provider payment identifier, unique idempotency constraints, capture-only fulfillment, 48-hour entitlement expiry, refund revocation, publication-window checks, and service-role-only mutation.
4. Make checkout and webhook use the same proven database target. Compare only non-secret project refs/hostnames; never print credentials.
5. Remove or disable direct unpaid rental/pass activation and SVOD surfaces only after the canonical schema and all callers are mapped.
6. Reconcile Supabase migration chain and embedded PGLite chain, then run isolated replay and database-backed tests before proposing a hosted Testing change.

### Updated gate status

| Gate | Status |
|---|---|
| Source inspection of protected-main checkout/catalog/webhook | PASS (read-only) |
| Unpaid entitlement / unpaid pass source paths identified | FAIL |
| Testing schema vs protected-main migration parity | FAIL |
| Single canonical TVOD ledger/order contract | BLOCKED |
| App DB ↔ Edge Function DB target parity | BLOCKED |
| Safe application source patch | BLOCKED — authority and target unresolved |
| Disposable replay of this isolated branch after a repair | NOT RUN |
| Hosted Testing writes / webhook deployment | NOT RUN |
| Production | HOLD |

This follow-up is documentation only. No application code, SQL migration, hosted database, payment state, secret, environment setting, or deployment was changed.
