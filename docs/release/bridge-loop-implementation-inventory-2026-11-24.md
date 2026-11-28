# Bridge → LOOP implementation inventory and reconciled contract

**Snapshot date:** 2026-11-24  
**Scope:** source and read-only database inspection for Testing/Preview implementation.  
**Production policy:** no Production writes, migrations, deployments, payments, email sends, or title publication.

## 1. Repositories and environments

| System | Reference |
|---|---|
| Bridge canonical repository | `picturecrayons-cyber/Media-Factory` |
| LOOP repository | `picturecrayons-cyber/crayons-loop-streaming-platform` |
| Testing Supabase project | `jbymleftneggcgutlcqu` |
| Production Supabase project | `mlmgugivsyoxzdgwkbpu` |
| Bridge implementation branch | `fix/bridge-loop-release-engine-20261124` |
| LOOP implementation branch | `fix/loop-authorization-compat-20261124` |

Testing and Production are not schema-identical. No application change should assume that a field or enum observed in one environment exists in the other.

## 2. Source route and function inventory

### 2.1 Bridge

**Primary source:** `src/lib/bridge/loop-publication.ts`

- `verifyDistributionPreflight()` — evaluates current title, rights, QC/legal and release certifications before authorization.
- `listLoopPublicationReadiness()` — authenticated GET readiness projection.
- `authorizeLoopPublication()` — authenticated POST publication authorization and Loop-title synchronization.
- `suspendLoopPublication()` — authenticated POST suspension.
- `revokeLoopPublication()` — authenticated POST revocation.
- `extendDistributionWindow()` — authenticated POST rights-window extension.
- `getLoopPublication()` — authenticated GET publication detail.

**Admin review source:** `src/lib/bridge/admin-workstations.ts`

- `listAdminWorkstations()` — GET source data for titles, assets, asset versions, QC, legal, rights, packages, publications and audit logs.
- `reviewAdminTitle()` — POST submission, QC and legal decisions.
- `setBuyerPublicationGate()` — POST OTT, packaging, curation and delivery certification.

**Database authorities referenced by the source:**

- `bridge_title_buyer_visibility()`
- `setBuyerPublicationGate()` and destination-package readiness checks
- `bridge_qc_cases`, `bridge_legal_cases`, `bridge_rights_grants`
- `bridge_title_gate_certifications`, `bridge_destination_packages`
- `bridge_loop_publications`, `bridge_audit_logs`, `bridge_title_events`

The current implementation still has more than one release/readiness calculation. A single canonical evaluator remains a required change.

### 2.2 LOOP

| Route / handler | Responsibility |
|---|---|
| `api/titles/public.ts` | Public catalogue through `public_loop_catalog`; returns 503 if the authority RPC fails |
| `api/razorpay/create-order.ts` | Authenticated TVOD order creation and payment-store preflight |
| `api/razorpay/verify-payment.ts` | Payment signature and captured-payment verification |
| `api/webhooks/[type].ts` | Provider event handling, including refund reconciliation |
| `api/media/stream-url.ts` | Protected media URL resolution, session and entitlement checks |

**Vercel route aliases** in `vercel.json` include:

- `/api/media/hls` → `/api/media/stream-url?action=hls`
- `/api/media/token` → `/api/media/stream-url?action=token`
- `/api/media/stream` → `/api/media/stream-url?redirect=true`
- `/api/razorpay/order` → `/api/razorpay/create-order`
- `/api/razorpay/verify` → `/api/razorpay/verify-payment`
- `/api/razorpay/webhook` → `/api/webhooks/razorpay`

Payment capture and refund processing are not publication authorization and must not create publication rights by themselves.

## 3. Database object inventory

### 3.1 Core tables inspected

- `bridge_titles`
- `bridge_assets`
- `bridge_asset_versions`
- `bridge_loop_publications`
- `bridge_loop_identity_links`
- `loop_titles`
- `loop_payment_events`
- `loop_user_tvod_entitlements`
- `bridge_audit_logs`
- `bridge_title_events`

### 3.2 Database functions inspected

**Testing includes:**

- `public_loop_catalog()`
- `loop_fulfill_captured_rental(... p_title_id text ...)`
- `loop_refund_captured_rental(...)`
- `loop_rental_fulfillment_ready()`
- `has_active_loop_tvod_entitlement(p_title_id text)`
- `bridge_duplicate_title_loop_release_allowed(p_title_id text)`

**Production includes:**

- `public_loop_catalog()`
- `loop_fulfill_captured_rental(... p_title_id uuid ...)`
- `loop_refund_captured_rental(...)`
- `loop_rental_fulfillment_ready()`
- `match_loop_titles(...)`

The function inventory is environment-specific; the Testing-only functions must not be assumed to exist in Production.

### 3.3 Schema and constraint differences confirmed

| Object | Testing | Production |
|---|---|---|
| `loop_titles.id` | text | uuid |
| Listing flags | `is_listed`, `is_published` | `listed`, `published` |
| Runtime | `runtime_minutes` | `duration_minutes` |
| Release year | `release_year` | `year` |
| Maturity rating | `age_rating` | `maturity_rating` |
| Artwork fields | `poster_url`, `backdrop_url`, `trailer_url` | `poster_path`, `backdrop_path`, `trailer_path` |
| Playback field | no legacy `playback_path` | legacy `playback_path` exists |
| Publication status constraint | `HOLD`, `AUTHORIZED`, `REVOKED`, `EXPIRED` | `pending`, `authorized`, `revoked`, `expired` |
| Publication `destination` column | present | absent |
| Identity-link verification fields | minimal link row | `verification_method`, `verified_at`, `verified_by` present |
| TVOD entitlement `title_id` | text | uuid |
| Bridge asset storage provenance | verified object key, checksum, provider, bucket, region, endpoint, storage verification time and object version/generation | storage lifecycle fields; verified object pointer fields are absent in the inspected schema |

**Important:** the Testing publication constraint is uppercase while Production is lowercase. The application must resolve the exact accepted value or use a schema-normalizing database contract; hard-coded casing is unsafe.

### 3.4 Canonical catalogue RPC

`public_loop_catalog()` is the existing cross-schema catalogue authority. Its definition uses JSONB field mapping to normalize legacy and current title fields, lowercases publication authorization for comparison, validates the publication window and rights arrays, and only returns approved/published, listed and published titles.

The LOOP checkout change now consumes this RPC rather than querying legacy `loop_titles` and lowercase `authorization_status` directly.

## 4. RLS, triggers, schedules and event persistence

### RLS

Testing and Production RLS policies are not identical:

- Testing denies browser roles access to `bridge_loop_publications`, `bridge_loop_identity_links`, `loop_titles`, `loop_payment_events` and `loop_user_tvod_entitlements`.
- Production has authenticated self-read policies for identity links, payment events and entitlements, and title-scoped read policies for publication and asset records.
- Testing asset policies allow workspace-scoped reads and owner inserts; Production asset reads are title-scoped.

Server-side service-role access is required for the cross-system authority checks. Browser reads must not become an alternate authorization path.

### Triggers and scheduled work

- No non-internal triggers were found on the inspected publication, Loop title, asset, identity-link, entitlement or payment-event tables in either environment.
- Neither database exposes `cron.job` / `pg_cron.job` in the inspected environment.
- The inspected Vercel configuration files contain no `crons` schedule.
- No publication outbox, delivery-attempt or publication-event table was found in either database.
- `bridge_audit_logs` and `bridge_title_events` exist, but they are not a Bridge→LOOP delivery outbox.

Therefore expiry/suspension retries and Bridge→LOOP delivery acknowledgement are not currently certified as scheduled, durable workflows.

## 5. Data readiness snapshot

The Testing database returned zero rows for:

- `loop_titles`
- `bridge_assets`
- `bridge_asset_versions`

Consequently, the current Testing environment cannot prove a real title publication, actual-object verification, asset provenance or protected playback. No title should be marked certified from empty-table or mocked evidence.

## 6. Source changes currently in draft branches

### Bridge draft PR #810

- Readiness GET no longer updates expiry/publication records or suppresses update failures.
- Loop title read projection now tolerates the two observed field vocabularies.
- Private playback object paths are removed from readiness responses.
- Authorization status writes resolve the database's exact allowed status value.
- Suspension uses a non-authorized HOLD/PENDING state; revocation uses the schema's REVOKED value.
- Static read-only invariant and status-vocabulary tests were added.

**Remaining Bridge blocker:** `authorizeLoopPublication()` still performs a legacy `loop_titles` INSERT/UPSERT. It must be replaced by a schema-normalizing, transactional Bridge→LOOP handoff before this PR is merge-ready. Reviewer evidence binding, shared release evaluator and expiry/outbox worker remain outstanding.

### LOOP draft PR #273

- TVOD checkout now uses `public_loop_catalog()`.
- Checkout authorization tests cover ID/slug lookup and fail-closed RPC failure.
- Playback no longer trusts client-supplied S3 keys or legacy `playback_path` as its authority.
- Playback requires canonical catalogue membership, Bridge identity link and active rental entitlement.
- A restricted `bridge_resolve_loop_asset()` migration source and helper/tests were added to the branch.

**Migration policy:** the resolver migration is source-only. It has not been applied to Testing or Production. Separate SQL review and explicit approval are required before any database write.

**Remaining LOOP blockers:** the current signer supports AWS S3 only; OCI-backed assets fail closed. Poster/trailer role mapping and public catalogue availability flags need evidence-backed reconciliation. Testing has no title/asset rows for E2E certification.

## 7. Preview and CI observations

- Bridge `media-factory` Preview for the implementation branch reached READY.
- Bridge CI build, typecheck, lint and npm test gate passed in the observed run; PostgreSQL workflow and migration replay were still running at the last check.
- LOOP typecheck initially failed because the Supabase RPC builder is PromiseLike rather than a native Promise. The helper type was corrected in the next commit; the follow-up CI run is pending.
- The canonical `crayonsloop` Preview project fails its build guard because configured Supabase URL aliases do not all point to the isolated Testing project. This is intentionally fail-closed. No Vercel environment variables were changed and no Production fallback was enabled.
- A second Vercel project linked to the LOOP repository is separate from the canonical `crayonsloop` project and is not treated as Production certification.

## 8. Reconciled target contract

1. Bridge is the sole authority for title identity, asset provenance, QC, rights, legal, commercial terms, package readiness and publication authorization.
2. One shared server-side release evaluator returns the same structured gate result to dashboards, buyer visibility, publication APIs and delivery workers.
3. QC/legal approvals bind reviewer identity and timestamp to exact evidence versions, asset version/master/poster keys and rights grant ID. Evidence changes invalidate the affected approval.
4. Publication authorization creates an immutable authorization snapshot and unique idempotent event in a durable Bridge outbox.
5. A signed delivery worker sends the event to LOOP, records attempts and acknowledgement, and supports retry/reconciliation.
6. LOOP validates the Bridge grant and asset provenance, maps metadata through an explicit schema contract, and serves only the current authorized catalogue and entitled playback.
7. Expiry/revocation is enforced by a separately authenticated idempotent worker. GET endpoints remain read-only.
8. Payment capture/refund is reconciled independently and never substitutes for rights approval or publication authorization.

## 9. Remaining implementation sequence

1. Replace Bridge's legacy Loop-title upsert with a schema-normalizing handoff contract; do not add duplicate columns.
2. Add a canonical release evaluator and make every visibility/readiness/publication path consume it.
3. Bind QC and legal decisions to exact evidence and asset/grant versions.
4. Design the Bridge outbox, delivery worker, LOOP receiver, acknowledgements and reconciliation state.
5. Complete expiry/revocation worker and audit records.
6. Review the LOOP asset resolver migration and OCI signing contract; obtain explicit approval before applying the migration to Testing.
7. Configure Preview with Testing-only Supabase aliases after explicit environment-change approval; never use Production credentials in Preview.
8. Seed only approved Testing fixtures through the Bridge approval workflow and certify three-title blocked-state behavior.
9. Run authenticated two-account playback, identity isolation, rights-withdrawal, expiry and refund tests.
10. Keep Production HOLD until separate approvals for each migration, deployment and individual film publication.

## 10. Change boundary

At this snapshot, no database migration has been applied, no database rows have been changed, no Production deployment has been made, no Vercel environment variable has been changed, and no Razorpay or Hostinger Mail action has been performed.
