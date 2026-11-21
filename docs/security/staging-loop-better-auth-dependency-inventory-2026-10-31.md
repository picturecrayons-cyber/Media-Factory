# Canonical Staging Loop + Auth dependency inventory — 31 Oct 2026

**Mode:** READ-ONLY evidence report.  
**Target:** Supabase Staging `jbymleftneggcgutlcqu`.  
**Repository source:** `picturecrayons-cyber/Media-Factory`, `main` at `2123a9983e6ef9c105d77824958cd9b784babb43`.  
**Production:** OUT OF SCOPE — HOLD / NOT CERTIFIED / NO-GO.

## 1. Staging catalog snapshot

Read-only `list_tables` for schemas `public` and `auth` returned 59 total tables, including exactly 32 in `public`. None of the public table names begin with `loop_`; none of the following relations exists:

| Relation | Source / code dependency | Staging |
|---|---|---|
| `public.bridge_loop_publications` | `migrations/0006_loop_canonical.sql`; Bridge publication + Loop catalog | MISSING |
| `public.loop_titles` | `0006`; catalog, details, entitlement, publication workflow | MISSING |
| `public.loop_profiles` | `0006`; `src/lib/loop/profile.ts` | MISSING |
| `public.loop_watch_progress` | `0006`; `src/lib/loop/profile.ts` | MISSING |
| `public.loop_watchlist` | `0006`; `src/lib/loop/profile.ts` | MISSING |
| `public.loop_subscriptions` | `0006`; `src/lib/loop/subscriptions.ts`, `catalog.ts` | MISSING |
| `public.loop_entitlements` | `0006`; `src/lib/loop/subscriptions.ts`, `catalog.ts` | MISSING |
| `public.loop_payment_events` | `src/lib/bridge/workflow.ts` | MISSING; no creating migration found in code search |
| `public.loop_user_tvod_entitlements` | `src/lib/bridge/workflow.ts` | MISSING; no creating migration found in code search |
| `public.bridge_loop_identity_links` | `0007a`; `src/lib/bridge/profiles.ts`, `session.ts` | MISSING |

The catalog snapshot also confirms `public.bridge_profiles.user_id` is `text`, and `auth.users.id` is `uuid`.

## 2. Loop application dependency map

| Relation | Application use | Access pattern in inspected source |
|---|---|---|
| `loop_titles` | Public catalog, title details, playback entitlement, Bridge publication | Server-side `getSql()`; catalog/details are server functions; publication writes are protected server functions |
| `bridge_loop_publications` | Bridge authorization state joined to Loop catalog | Server-side `getSql()`; Bridge writes require auth middleware, verified actor and permission checks |
| `loop_profiles` | Consumer profile list/create/switch | `authMiddleware` + `getSql()`; queries scoped by verified `context.userId` |
| `loop_watch_progress` | Save/read playback progress | `authMiddleware` + `getSql()`; scoped by verified user ID |
| `loop_watchlist` | Add/remove/list saved titles | `authMiddleware` + `getSql()`; scoped by verified user ID |
| `loop_subscriptions` | Subscription read/create and SVOD entitlement check | `authMiddleware` + `getSql()`; scoped by verified user ID |
| `loop_entitlements` | TVOD rental/purchase entitlement checks | `authMiddleware` + `getSql()`; scoped by verified user ID |
| `loop_payment_events`, `loop_user_tvod_entitlements` | Bridge workflow receipt/payment reconciliation | Referenced by server-side workflow SQL; no creation DDL found in the searched repository source |

All inspected runtime data access uses server-side `getSql()`; no direct browser Supabase table query was found in these source files. This supports Option A for the inspected paths, but does not certify every route or every deployed runtime path.

## 3. Migration 0006 — complete source scope and safety

`migrations/0006_loop_canonical.sql` creates seven relations:

1. `bridge_loop_publications`
2. `loop_titles`
3. `loop_profiles`
4. `loop_watch_progress`
5. `loop_watchlist`
6. `loop_subscriptions`
7. `loop_entitlements`

It also creates indexes, then performs data-changing statements:
- inserts a Jananam master record into `bridge_titles`;
- inserts an authorized `bridge_loop_publications` row;
- inserts a Jananam `loop_titles` row;
- on conflict, updates the title to `published = true`, `listed = true`, `status = 'approved'`.

**Do not replay migration 0006.** Its schema and data/publication operations must be separated and independently reviewed. No publication or title row is authorized by this inventory.

Two further code references (`loop_payment_events`, `loop_user_tvod_entitlements`) have no creation migration identified in the searched source. They need an owner/source decision before any schema draft.

## 4. Auth / identity dependency reconciliation

### Current runtime source

- `src/lib/auth/middleware.ts` documents and implements Supabase bearer-token authentication.
- Server middleware calls `requireUser()` from `src/lib/auth/verify.server.ts`.
- `verify.server.ts` calls Supabase Auth REST endpoint `/auth/v1/user` and returns the verified Supabase UUID as `context.userId`.
- `src/lib/bridge/profiles.ts` stores this identity in `bridge_profiles.user_id` and calls `persistSupabaseIdentityLink()`.
- `persistSupabaseIdentityLink()` writes `bridge_loop_identity_links.bridge_user_id` and `auth_user_id`; it does not query a Better Auth `public.user` record.

### Better Auth source mismatch

`migrations/0001_auth.sql` describes and creates Better Auth relations:
- `public."user"`
- `public."session"`
- `public."account"`
- `public."verification"`

All four are missing from the canonical Staging catalog snapshot. The inspected Staging migration ledger contains 13 entries, all named `test_...`; it contains no `0001_auth`, `0006_loop_canonical`, or `0007a_identity_links` entry.

The current inspected runtime auth path is Supabase Auth, not Better Auth. Therefore the `public."user"` FK in `0007a_identity_links.sql` appears inconsistent with the current runtime identity model unless a separate Better Auth dependency is intentionally retained. Do not create `public."user"` merely to satisfy this FK.

### Identity-link FK decision needed

- Current runtime `context.userId` originates from `auth.users.id` (UUID) and is also used as text in `bridge_profiles.user_id`.
- Current application identity-link code associates the auth UUID with a Bridge profile ID.
- Source migration `0007a` instead references `public."user"(id)` for `bridge_user_id`, even though the current profile record lives in `public.bridge_profiles(user_id)`.
- Before creating the link table, the application/schema owner must decide whether `bridge_user_id` should reference `bridge_profiles(user_id)` (current Bridge profile model) or whether a Better Auth `public.user` is genuinely still required. This is a source-contract question, not a database-only repair.
- `auth.users.id` exists and is UUID; the proposed `auth_user_id uuid` FK type is compatible at the type level. Existence alone does not approve the identity-link table.

## 5. Migration ledger snapshot

The Staging migration ledger returned 13 entries, all with `test_` prefixes. It did not contain entries corresponding to:
- `0001_auth.sql`
- `0006_loop_canonical.sql`
- `0007a_identity_links.sql`
- `0008_bridge_data_api_lockdown.sql`
- `0012_bridge_rls_identity_binding.sql`
- `0013_harden_bridge_rls_helpers.sql`

The ledger is not proof that no equivalent schema was created manually, but the live catalog independently confirms the listed Loop/Auth relations are absent.

## 6. Required next steps — read-only / source design only

1. Identify the authoritative schema owner/source for `loop_payment_events` and `loop_user_tvod_entitlements`.
2. Decide the intended identity FK model: current `bridge_profiles.user_id` vs legacy Better Auth `public.user.id`.
3. Map every `0006` table/index and any foreign-key dependency against the current 32-table Staging catalog.
4. Reconcile migration ledger naming and actual root migration runner behavior; do not mark migrations applied or execute them.
5. Only then prepare a revised schema-only proposal with all data-changing Jananam statements excluded.
6. Separately retain the ACL/default-ACL gates in the companion repair draft. No default ACL provenance was established by this inventory.

## 7. Safety result

- Read-only catalog and source inspection only.
- No SQL DDL/DML, GRANT/REVOKE, ALTER DEFAULT PRIVILEGES, RLS/policy changes, migration, identity link, data mutation, deployment, or merge performed.
- SQL repair draft remains **NOT READY FOR EXECUTION**.
- Production remains **HOLD / NOT CERTIFIED / NO-GO**.


## Follow-up source investigation — 31 Oct 2026

### Additional payment/TVOD schema search

A repository-wide GitHub code search on the current default branch for `loop_payment_events`, `loop_user_tvod_entitlements`, `payment_transaction_id`, and candidate CREATE TABLE definitions returned only the SQL usage in `src/lib/bridge/workflow.ts`; no migration, typed schema, or owning service contract was located. The inspected query expects these fields:

- `loop_payment_events`: `razorpay_payment_id`, `payload`, `status`, `processed_at`, `received_at`.
- `loop_user_tvod_entitlements`: `payment_transaction_id`, `title_id`.

These are query-observed fields, **not** a complete authoritative schema. No table DDL is to be invented. The payment/revenue query remains an unresolved runtime dependency until the system owner supplies a versioned migration/schema or reviewed data contract.

### Identity FK source decision

Further source inspection of `src/lib/bridge/session.ts`, `src/lib/bridge/profiles.ts`, and `migrations/0004_bridge.sql` supports the following proposed source correction:

- `bridge_loop_identity_links.bridge_user_id` should reference `public.bridge_profiles(user_id)` (text → text, ON DELETE RESTRICT).
- `bridge_loop_identity_links.auth_user_id` should reference `auth.users(id)` (uuid → uuid, ON DELETE CASCADE).

Reason: the current runtime authenticates through Supabase Auth; Bridge actors are loaded from `bridge_profiles`; identity resolution supports mapping a Supabase Auth UUID to a Bridge profile ID; and onboarding persists that mapping. The legacy `0007a_identity_links.sql` FK to Better Auth `public."user"(id)` does not match the inspected current runtime model. Do not create `public."user"` solely to satisfy that old FK. Owner approval and source migration reconciliation remain required; no identity table or row was created.

### Seven-table schema-only draft

Created [schema-only dependency draft](./staging-loop-schema-only-dependency-draft-2026-10-31.md), extracting all seven relation/index definitions from `0006_loop_canonical.sql` while excluding every Jananam INSERT and UPDATE/publication statement. This is a design artifact only, not an executable migration. The draft preserves source-declared constraints and explicitly flags missing user/title FK decisions for owner review.

### Updated disposition

- Seven-table schema extraction: drafted, not applied.
- Payment/TVOD schema: still blocked; authoritative source not found.
- Identity FK: recommended `bridge_profiles(user_id)` + `auth.users(id)`; owner approval pending.
- ACL/default-ACL repair: remains blocked pending dependency decisions and independent ACL preflight.
- Production: HOLD / NOT CERTIFIED / NO-GO.


## Additional cross-repository and identity source review — 31 Oct 2026

### Payment/TVOD: source trace expanded

The separate Loop repository `picturecrayons-cyber/crayons-loop-streaming-platform` PR #15 changes checkout preflight to query `loop_payment_events` and `loop_user_tvod_entitlements`. Media-Factory Issue #199 describes the historical Loop production webhook as persisting `loop_payment_events` and calling `loop_fulfill_captured_rental`. These are evidence of the owning product flow and historical use, **not authoritative table DDL**.

Repository code search in both current default branches did not locate a CREATE TABLE/migration for either table; PR #15 itself does not add a schema migration. No source-of-truth schema artifact or named schema owner approval was found. The payment schema remains BLOCKED. The authoritative next source must be the exact applied Supabase migration/schema history for the Loop database or an owner-provided versioned SQL export; do not reconstruct it from call sites.

### Identity FK: prior recommendation downgraded to unresolved

Further historical source evidence contradicts treating the earlier `bridge_profiles(user_id)` FK proposal as approved:

- `migrations/0007a_identity_links.sql` explicitly references `public."user"(id)` for `bridge_user_id`.
- The Scope A PostgreSQL harness in the same source history seeds `public."user"` and `auth.users` before inserting an identity link; its comment calls both required identity fixtures.
- PR #23 and current `docs/authentication-architecture.md` establish Supabase Auth as the canonical login/session authority and use identity links to map Auth UUIDs to Bridge profile IDs. PR #23's execution comment reports a founder mapping persisted in Production. That confirms the mapping workflow, **not** approval to change the FK target.
- The current architecture doc says Better Auth schema artifacts are legacy/transitional, but does not explicitly approve replacing the FK with `bridge_profiles(user_id)`.

**Disposition:** FK target remains **OWNER DECISION REQUIRED**. Do not apply the previous recommendation or create `public.user` just to satisfy an old migration. Owner must decide whether `public.user` remains a deliberate legacy identity registry or whether the migration and tests should be revised to reference `bridge_profiles(user_id)`. Then update the canonical migration, test harness, and compatibility plan consistently. No owner approval for either option was located.

### Status correction

- Payment/TVOD DDL source: **NOT FOUND**; Loop PR #15 / Issue #199 provide usage/history only.
- Identity FK: **UNRESOLVED**; no approved FK-target decision found.
- ACL repair: remains blocked.
