# Loop schema-only dependency draft — 31 Oct 2026

**Status: DESIGN / REVIEW ONLY — NOT READY FOR EXECUTION.**  
**Target for future review:** canonical Supabase Staging `jbymleftneggcgutlcqu` only.  
**Production:** OUT OF SCOPE — HOLD / NOT CERTIFIED / NO-GO.  
**Source:** `migrations/0006_loop_canonical.sql`, extracted table/index definitions only.

## 1. Scope and safety boundary

This document isolates the seven Loop relations declared by `migrations/0006_loop_canonical.sql`:

1. `public.bridge_loop_publications`
2. `public.loop_titles`
3. `public.loop_profiles`
4. `public.loop_watch_progress`
5. `public.loop_watchlist`
6. `public.loop_subscriptions`
7. `public.loop_entitlements`

Only schema definitions and indexes are included. The following source-migration statements are deliberately excluded:

- Jananam Bridge master-title INSERT.
- Jananam publication INSERT with `authorization_status='authorized'`.
- Jananam Loop title INSERT.
- Jananam conflict UPDATE setting `published=true`, `listed=true`, and `status='approved'`.

**Never replay `0006_loop_canonical.sql` wholesale.** This file is documentation for design review, not an executable migration. No DDL/DML has been run.

## 2. Seven-table schema-only extraction

The following SQL is a faithful schema/index extraction from the source migration. It has not been normalized, expanded with speculative constraints, or run against Staging. The original migration did not declare user/profile/title foreign keys for the six non-publication tables beyond the two `bridge_titles` references shown below. Do not add such constraints without a separately approved data-model decision.

```sql
-- 1. Bridge authorization/publication record
CREATE TABLE IF NOT EXISTS public.bridge_loop_publications (
  id text PRIMARY KEY,
  bridge_title_id text UNIQUE NOT NULL
    REFERENCES public.bridge_titles(id) ON DELETE CASCADE,
  loop_title_id text UNIQUE NOT NULL,
  authorization_status text NOT NULL DEFAULT 'pending',
  territories text[] NOT NULL DEFAULT '{"IN"}',
  languages text[] NOT NULL DEFAULT '{"Malayalam"}',
  exploitation_models text[] NOT NULL DEFAULT '{"SVOD"}',
  window_start timestamptz,
  window_end timestamptz,
  approved_by text,
  approved_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bridge_loop_pub_status_idx
  ON public.bridge_loop_publications(authorization_status);

-- 2. Consumer catalog title
CREATE TABLE IF NOT EXISTS public.loop_titles (
  id text PRIMARY KEY,
  bridge_title_id text UNIQUE
    REFERENCES public.bridge_titles(id) ON DELETE SET NULL,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  synopsis text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'movie',
  language text NOT NULL DEFAULT 'Malayalam',
  year int,
  duration_minutes int,
  poster_path text,
  backdrop_path text,
  playback_path text,
  maturity_rating text NOT NULL DEFAULT 'U',
  genres text NOT NULL DEFAULT 'Drama',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'approved',
  listed boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  access_tier text NOT NULL DEFAULT 'SVOD',
  tvod_rental_price int NOT NULL DEFAULT 79,
  tvod_purchase_price int NOT NULL DEFAULT 249,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loop_titles_published_idx
  ON public.loop_titles(published, listed, status);

-- 3. Viewer profiles
CREATE TABLE IF NOT EXISTS public.loop_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'adult',
  is_active boolean NOT NULL DEFAULT true,
  pin text NOT NULL DEFAULT '0000',
  avatar text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loop_profiles_user_idx
  ON public.loop_profiles(user_id);

-- 4. Playback progress
CREATE TABLE IF NOT EXISTS public.loop_watch_progress (
  user_id text NOT NULL,
  loop_title_id text NOT NULL,
  position_seconds int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, loop_title_id)
);

-- 5. Viewer watchlist
CREATE TABLE IF NOT EXISTS public.loop_watchlist (
  user_id text NOT NULL,
  loop_title_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, loop_title_id)
);

-- 6. SVOD subscription
CREATE TABLE IF NOT EXISTS public.loop_subscriptions (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  plan_key text NOT NULL DEFAULT 'svod_monthly',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loop_subs_user_idx
  ON public.loop_subscriptions(user_id);

-- 7. Title-specific TVOD/SVOD entitlement
CREATE TABLE IF NOT EXISTS public.loop_entitlements (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  loop_title_id text NOT NULL,
  access_type text NOT NULL DEFAULT 'TVOD_RENTAL',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loop_entitlements_user_idx
  ON public.loop_entitlements(user_id);
```

## 3. Dependency map and preflight blockers

| Relation | Declared dependency | Required preflight |
|---|---|---|
| `bridge_loop_publications` | `public.bridge_titles(id)` text key | Confirm target table, key type, owner, existing constraints/indexes |
| `loop_titles` | `public.bridge_titles(id)` text key, nullable FK | Same; inspect existing title data and uniqueness collisions |
| `loop_profiles` | None declared in source | Decide user ownership contract; inspect consumers before adding FK |
| `loop_watch_progress` | None declared in source | Confirm user/title ID semantics and uniqueness assumptions |
| `loop_watchlist` | None declared in source | Confirm user/title ID semantics and uniqueness assumptions |
| `loop_subscriptions` | None declared in source | Confirm payment/provider lifecycle and status vocabulary |
| `loop_entitlements` | None declared in source | Confirm entitlement grant/revoke and payment linkage model |

Prior canonical Staging catalog inspection reported all seven relations absent, and `public.bridge_titles` present. Recheck all of this immediately before any future approved implementation. A table-name existence check is not enough: compare full columns, types, defaults, constraints, indexes, owners, ACLs, and data before considering `IF NOT EXISTS`.

The original migration has no declared foreign keys from the user-scoped Loop tables to `bridge_profiles` or `auth.users`. This draft intentionally preserves that source behavior; it does **not** endorse it as the final integrity model.

## 4. Additional runtime dependencies — unresolved authoritative source

`src/lib/bridge/workflow.ts` reads:

- `loop_payment_events`: fields used include `razorpay_payment_id`, `payload`, `status`, `processed_at`, and `received_at`.
- `loop_user_tvod_entitlements`: fields used include `payment_transaction_id`, `title_id`, and a join to payment IDs.

The repository-wide GitHub code search on the current default branch found these names only in the query in `src/lib/bridge/workflow.ts`. No CREATE TABLE migration, schema definition, typed database model, or documented external schema owner was found in the searched repository source. Canonical Staging catalog inspection also reported no such relations.

**Disposition: BLOCKED — authoritative schema source not identified.** Do not invent their columns, keys, payment states, webhook semantics, retention, or ownership. Before designing these tables, obtain one of:

1. the owning service's versioned migration/schema and its repository/release reference;
2. a reviewed export of the authoritative source database's table definitions and constraints; or
3. a signed-off data contract from the system owner, including Razorpay event idempotency and entitlement lifecycle.

Until then, the `getTitleRevenue` query is an unresolved runtime dependency and revenue reporting cannot be considered verified.

## 5. Identity-link FK decision — recommended source correction, not applied

### Evidence from current source

- `migrations/0004_bridge.sql` defines `public.bridge_profiles.user_id` as `text PRIMARY KEY`.
- Current `src/lib/auth/verify.server.ts` validates Supabase bearer tokens through Supabase Auth; the authenticated principal is the Supabase Auth UUID.
- Current `src/lib/bridge/session.ts` first resolves a direct `bridge_profiles.user_id = authUserId` match, then looks up `bridge_loop_identity_links.auth_user_id`, then has a verified-email legacy recovery path.
- Current `src/lib/bridge/profiles.ts` writes the Bridge profile and then persists the Supabase identity link.
- The current Staging catalog has `public.bridge_profiles.user_id` (text) and `auth.users.id` (uuid), but does not have `public."user"`.
- `migrations/0007a_identity_links.sql` instead declares `bridge_user_id REFERENCES public."user"(id)`. `migrations/0001_auth.sql` defines that Better Auth table with text IDs, but the inspected current runtime uses Supabase Auth rather than Better Auth sessions.

### Recommended intended FK

For the current Supabase Auth + Bridge profile model, the source-aligned relationship should be:

- `bridge_loop_identity_links.bridge_user_id` → `public.bridge_profiles(user_id)` (text → text, ON DELETE RESTRICT).
- `bridge_loop_identity_links.auth_user_id` → `auth.users(id)` (uuid → uuid, ON DELETE CASCADE).

This reflects the runtime mapping: a Supabase Auth principal may map to an existing Bridge profile whose key is not necessarily identical. New onboarding currently uses the Auth UUID string as the Bridge profile's text ID, while the link table supports legacy/different Bridge profile IDs.

**Do not create `public."user"` merely to satisfy the old FK.** Better Auth may be obsolete for this runtime, but removing or deprecating its schema/migration contract requires repository-owner approval. Update/reconcile the source migration before any DDL is considered. The recommended FK model is a source-design finding, not authorization to create the identity-link table or rows.

## 6. Required next decisions before an implementation-ready migration

1. Obtain authoritative schema for `loop_payment_events` and `loop_user_tvod_entitlements`.
2. Have the repository/schema owner approve the `bridge_profiles(user_id)` FK correction and explicitly disposition the legacy Better Auth migration.
3. Confirm whether the seven source-extracted Loop tables are still the intended product schema; review the no-FK user/title references and default values, especially `loop_profiles.pin`.
4. Compare all seven definitions against the live Staging catalog again, including owner/ACL/index/constraint/data checks.
5. Create a new reviewed migration from the approved schema source; do not repurpose or replay `0006_loop_canonical.sql`.
6. Keep Jananam title, publication, and Loop catalog data out of schema repair. Any title publication requires a separate rights/QC/legal authorization workflow and explicit approval.
7. Only after the above, return to the ACL/default-ACL repair review.

## 7. Final status

- Seven-table schema-only extraction: **DRAFTED FROM SOURCE; NOT EXECUTED**.
- Jananam data/publication statements: **EXCLUDED**.
- `loop_payment_events` / `loop_user_tvod_entitlements`: **BLOCKED — no authoritative schema source found**.
- Identity FK: **recommended `bridge_profiles(user_id)` + `auth.users(id)`; owner approval and source migration reconciliation pending**.
- ACL repair: **REVIEW BLOCKED pending dependency resolution**.
- No DDL, DML, GRANT/REVOKE, default ACL, RLS/policy, identity-link, migration, deployment, or merge performed.
- Production: **HOLD / NOT CERTIFIED / NO-GO**.


## Identity FK owner decision — unresolved

A later cross-source review found that the earlier `bridge_profiles(user_id)` FK recommendation is **not approved** and should not be treated as selected. The existing `0007a_identity_links.sql` explicitly references `public."user"(id)`, and the Scope A PostgreSQL harness seeds both `public."user"` and `auth.users` before inserting the identity link. PR #23/current architecture docs establish Supabase Auth as the login/session authority and use a mapping to Bridge profile IDs, but they do not explicitly approve changing the FK target.

The owner must decide whether `public.user` remains a deliberate legacy identity registry or whether the identity migration and tests should be revised to reference `public.bridge_profiles(user_id)`. Until then, no FK target is approved and no identity DDL/rows may be created.

