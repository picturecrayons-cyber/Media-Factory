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


## CI PostgreSQL log anomaly triage — 2026-11-21

The PostgreSQL job log contained `ERROR: relation "bridge_audit_logs" does not exist`, while the workflow job concluded successfully. This was investigated against the exact protected-main test source and workflow:

- `.github/workflows/ci.yml` runs `npm run test:workflow` against a disposable PostgreSQL 16 service using a hard-coded local-only connection string. The test refuses to run with that binding unless `CI=true`.
- `src/lib/bridge/workflow.test.ts` creates `bridge_audit_logs` in its isolated fixture, then the explicit negative test **"an audit failure rolls back review records and lifecycle"** drops that table before calling the workflow. The expected assertion is that the transaction rejects and leaves the title at `QC_REVIEW` with no QC case.
- The fetched PostgreSQL log shows the missing-relation error at the exact audit insert statement. This matches the deliberate failure-injection test, not an unexplained production/Testing database error.
- The workflow job's recorded conclusion was `success`; the CI run is `44885070935`, job `136788834155`.

### Log triage status

| Check | Status |
|---|---|
| Error mapped to explicit negative test | PASS |
| Error is expected failure injection in disposable CI database | PASS |
| PostgreSQL workflow job conclusion | PASS |
| Production or hosted Testing database involved | NO — isolated CI PostgreSQL service |
| Application/schema change required for this log entry | NO |

This resolves the previously noted CI log anomaly. It does not change the TVOD schema mismatch, database-target parity blocker, Preview evidence gap, or Production HOLD.


## Read-only Testing TVOD contract re-verification — 2026-11-21

The approved Testing project `jbymleftneggcgutlcqu` was re-inspected read-only. This adds a more precise contract snapshot and supersedes any earlier shorthand that implied the six-argument fulfillment RPC was absent.

### Live Testing project evidence

- Project status: `ACTIVE_HEALTHY`; region `ap-south-1`; PostgreSQL 17.11.
- Migration ledger: 70 records. It contains a Testing-specific runtime migration `20261110183454 loop_runtime_tables_and_atomic_tvod_fulfillment_staging` and later Testing-only TVOD catalog/entitlement/readiness migrations.
- Existing tables: `loop_titles`, `loop_user_tvod_entitlements`, `loop_payment_events`, `bridge_loop_publications`.
- Absent tables: `loop_tvod_orders`, `loop_tvod_payment_events`.
- Identifier types:
  - `loop_titles.id TEXT`
  - `loop_titles.bridge_title_id TEXT`
  - `loop_user_tvod_entitlements.user_id UUID`
  - `loop_user_tvod_entitlements.title_id TEXT`
  - `loop_user_tvod_entitlements.payment_transaction_id TEXT`
  - `bridge_loop_publications.loop_title_id TEXT`
  - `loop_payment_events.razorpay_payment_id TEXT`, `user_id UUID`, `event_id TEXT`
- Live Testing fulfillment RPC is present with signature:
  `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)`.
- Refund RPC is `loop_refund_captured_rental(text,text)`; readiness RPC exists.
- The live function definition checks the Testing-specific fields `is_listed`, `is_published`, `destination='CRAYONS_LOOP'`, uppercase publication state, publication language/territory, and uses the existing `loop_payment_events` ledger.
- Function privilege checks: `anon=false`, `authenticated=false`, `service_role=true` for all three RPCs.
- RLS is enabled on the four inspected TVOD/catalog/publication tables; browser roles have explicit deny policies on those tables.
- The only deployed Edge Function listed in this Testing project is `loop-public-catalog` (active v3); `razorpay-webhook` is not listed as deployed.

### Reconciliation against source candidates

1. The protected-main source migration `20261002171708_loop_release_safety.sql` defines the six-argument fulfillment RPC with `p_title_id UUID`, and uses `listed`, `published`, and UUID title IDs. It therefore does **not** match the live Testing function signature or schema.
2. The PR #767 implementation migration/source expects an order-based API, `loop_tvod_orders`, `loop_tvod_payment_events`, a separate payment-event ledger, and other catalog field assumptions. Those objects/fields are not present in the live Testing snapshot.
3. The live Testing TVOD schema is a distinct Testing-specific contract with a TEXT title identifier, UUID user identifier, one payment event ledger, and a six-argument capture RPC. Its exact source migration is not present on protected `main` under the corresponding Testing migration version/name; GitHub default-branch code search did not locate the Testing-specific migration file.
4. This gives a concrete schema/API mismatch, but does not establish that the Testing schema is the canonical production contract. It is a Testing-only lineage and cannot be promoted as authoritative without an approved source-of-truth decision and a migration reconciliation.

### Updated decision

- Do not add a second TVOD payment ledger.
- Do not introduce `loop_tvod_orders` based solely on PR #767.
- Do not cast TEXT title identifiers to UUID or alter existing entitlement rows.
- Do not deploy the webhook: it is absent from the Testing Edge Function inventory.
- Source repair remains BLOCKED until the canonical schema owner chooses and documents the authoritative title identifier, order persistence contract, and webhook fulfillment API, then reconciles the Testing-only migration lineage with the protected-main migration chain.
- No hosted Testing or Production writes were performed; no migration, webhook, environment, secret, payment, or deployment was changed.


### Additional protected-main lineage check

A source-side GitHub check against protected `main` (SHA `1253362e2bb19b9fbe513dd50be1e115a0dfc3c6`) confirms:

- `20260925214917_loop_canonical_runtime_baseline.sql` declares `loop_titles.id UUID`, `loop_user_tvod_entitlements.title_id UUID`, and `bridge_loop_publications.loop_title_id UUID`.
- `20261002171708_loop_release_safety.sql` declares `loop_fulfill_captured_rental(..., p_title_id UUID, ...)`, and reads the older `listed` / `published` catalog columns.
- The live Testing project instead has TEXT title IDs and `is_listed` / `is_published`, plus the Testing-specific migration ledger entry `20261110183454 loop_runtime_tables_and_atomic_tvod_fulfillment_staging`.
- This confirms the divergence is not merely an API typo: the Testing project has a distinct schema lineage from the protected-main source baseline. The Testing project is not evidence that protected-main UUID identifiers should be changed to TEXT.
- It still does **not** prove the current Production database's exact schema or migration state; no Production DB was queried in this scope.

Decision refined: protected-main source lineage is the authoritative **repository contract** for implementation work; Testing is a deliberately separate test project whose schema must be reconciled in an isolated test migration/replay path, not used to rewrite production source types by guess. Before any hosted Testing migration, the Testing-only lineage must be reconciled to the source baseline and tested on a disposable local database. This is not permission to write to hosted Testing or Production.


### Isolated replay evidence reviewed (existing CI run; no new run triggered)

Reviewed GitHub Actions run `44885070935` and decoded job logs:

- Workflow run: `https://github.com/picturecrayons-cyber/Media-Factory/actions/runs/44885070935`
- The migration replay job checked out PR #767's merge ref `f60e2b5ff995c8a34e8a10570f87cffc8b4f3ead` (merge of candidate `0b13e74...` into base `c20bc0d...`), **not** protected `main` SHA `1253362...` and not the audit branch head.
- The job moved the repo migration directory aside, started a fresh isolated local Supabase stack, restored the recovered Production-ledger migrations, and replayed them against local `127.0.0.1:55432/postgres`.
- Log reports all 73 recovered Production-ledger migrations replayed successfully, RLS verified on 54 Bridge tables, and the candidate TVOD feature migration `20261118130000_loop_tvod_payment_fulfillment.sql` passed the job's replay checks.
- Creator Document Vault and exclusive sublicensing migrations also passed in that same isolated job.
- No hosted Supabase URL was used by this replay job. No Testing or Production database write is evidenced.

### What this replay does and does not prove

- PASS: The CI candidate merge ref can replay the recovered 73-migration Production ledger on a disposable local Supabase stack.
- NOT TESTED: A clean replay of the exact protected-main SHA without PR #767 changes.
- NOT TESTED: The Testing project's separate 70-record migration lineage; its Testing-specific migration SQL is not present in the protected-main source tree or the inspected audit branch path.
- NOT PROVEN: Compatibility between the live Testing schema and the protected-main source baseline; the observed UUID/TEXT and catalog-field divergence remains.
- NOT PROVEN: Razorpay webhook runtime/Edge Function deployment, checkout-to-capture-to-refund end-to-end behavior, canonical Bridge Vercel Preview, or Production readiness.

No new CI run was triggered, no source/SQL files were changed, and no hosted database or deployment was modified.
