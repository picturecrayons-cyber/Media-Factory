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
