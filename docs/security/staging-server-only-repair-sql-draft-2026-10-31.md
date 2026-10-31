# Staging-only server-only privilege repair — SQL review draft

**Status: REVIEW ONLY — DO NOT RUN / DO NOT APPLY.**  
**Target:** Supabase Staging `jbymleftneggcgutlcqu` only.  
**Production:** OUT OF SCOPE — HOLD / NOT CERTIFIED / NO-GO.  
**Architecture decision:** Option A — Server-only Bridge Data API accepted as the design direction for this draft.

This file contains proposed SQL snippets for human review. It is not an executable migration, is not wired into the migration runner, and must not be copied into a SQL editor or applied until every precondition below is independently re-verified and a separate implementation approval is given.

## 1. Explicit scope and preservation rules

- Revoke direct `anon` and `authenticated` privileges from the 17 verified public tables listed below.
- Revoke direct `anon` and `authenticated` privileges from the five verified public sequences listed below.
- Propose narrowly scoped default-ACL changes for objects created by role `postgres` in schema `public` only.
- Do not alter `service_role`, object ownership, role memberships, RLS enablement, policies, or data.
- Do not touch platform schemas or defaults: `auth`, `storage`, `graphql`, `graphql_public`, `realtime`, `extensions`, or any other non-public schema.
- Do not replay migrations 0006, 0007a, 0008, 0012, or 0013 wholesale.

## 2. Preconditions — read-only checks required immediately before implementation

The following must all pass before any proposed ACL statements are considered:

1. Connected project ref is exactly `jbymleftneggcgutlcqu`; abort for any other project.
2. All 17 named tables and five named sequences exist in `public`.
3. Each table owner and sequence owner is recorded; the current audit observed `postgres` ownership for the five sequences, but table ownership must be rechecked.
4. All 32 Bridge public tables still have RLS enabled.
5. Capture exact direct ACLs, grantors, grant options, column-level ACLs, PUBLIC grants, and effective privileges before change.
6. Confirm the current `postgres/public` default ACL values and their provenance with Supabase support or authoritative audit evidence. Catalog ownership alone does not identify who installed them.
7. Confirm the migration execution role is `postgres` before using the default-ACL statements below.
8. Confirm no application/browser feature requires direct Supabase Data API access. Option A means Bridge routes use server-side `getSql()` and server-side authorization; no browser-facing RLS read surface is being created.
9. Confirm the exact schema prerequisites for the two missing relations in Section 5.

**Abort condition:** if any object is missing, ownership differs, a privilege is inherited from another role/PUBLIC, or a default ACL is not attributable, stop and revise the draft. Do not broaden the change to compensate.

## 3. Existing table ACL revokes — proposed only

The prior live effective-privilege check confirmed all seven table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) for both `anon` and `authenticated` on each of these 17 tables:

- `bridge_profiles`
- `bridge_titles`
- `bridge_title_events`
- `bridge_assets`
- `bridge_payments`
- `bridge_webhook_events`
- `bridge_entitlements`
- `bridge_audit_logs`
- `bridge_email_challenges`
- `bridge_invites`
- `bridge_asset_versions`
- `bridge_buyer_interest`
- `bridge_destination_packages`
- `bridge_legal_cases`
- `bridge_qc_cases`
- `bridge_rights_grants`
- `bridge_story_concept_submissions`

Proposed SQL, after the preconditions pass:

```sql
REVOKE ALL PRIVILEGES ON TABLE
  public.bridge_profiles,
  public.bridge_titles,
  public.bridge_title_events,
  public.bridge_assets,
  public.bridge_payments,
  public.bridge_webhook_events,
  public.bridge_entitlements,
  public.bridge_audit_logs,
  public.bridge_email_challenges,
  public.bridge_invites,
  public.bridge_asset_versions,
  public.bridge_buyer_interest,
  public.bridge_destination_packages,
  public.bridge_legal_cases,
  public.bridge_qc_cases,
  public.bridge_rights_grants,
  public.bridge_story_concept_submissions
FROM anon, authenticated;
```

This revokes direct ACL entries for the named roles only. It does not override privileges inherited through other roles or granted to `PUBLIC`; post-change effective-privilege checks must prove the intended result. Do not change role membership as part of this repair.

## 4. Existing sequence ACL revokes — proposed only

The five public sequences found in the Staging catalog were:

- `bridge_audit_logs_id_seq`
- `bridge_entitlements_id_seq`
- `bridge_service_order_events_id_seq`
- `bridge_title_events_id_seq`
- `bridge_title_reconciliation_events_id_seq`

The read-only catalog check found effective USAGE, SELECT, and UPDATE for both browser roles on all five.

Proposed SQL:

```sql
REVOKE ALL PRIVILEGES ON SEQUENCE
  public.bridge_audit_logs_id_seq,
  public.bridge_entitlements_id_seq,
  public.bridge_service_order_events_id_seq,
  public.bridge_title_events_id_seq,
  public.bridge_title_reconciliation_events_id_seq
FROM anon, authenticated;
```

Do not change sequence ownership or grants for `service_role`/server roles. Recheck whether any effective access remains through `PUBLIC` or role inheritance.

## 5. Missing relation dependencies — do not replay the source migrations

### 5.1 `bridge_loop_publications`

The source DDL is in `migrations/0006_loop_canonical.sql`, but that migration also inserts a Jananam title/publication and updates `loop_titles` to `published=true`, `listed=true`, and `status='approved'`. **Do not replay 0006** to create the missing table: it contains data/publication side effects that are outside this repair.

The schema-only table definition below is extracted from the source migration and is proposed as an isolated DDL step only after verifying `public.bridge_titles` exists and its key type matches. It deliberately contains no INSERT/UPDATE of titles or publication rows.

```sql
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
```

Before considering this DDL, compare the complete live `loop_titles` schema and application query contract, and verify there is no existing relation under another schema/name. This table's creation does not authorize any publication or Loop visibility.

### 5.2 `bridge_loop_identity_links`

Source: `migrations/0007a_identity_links.sql`. It references both:

- `public."user"(id)` — the canonical Staging audit reported this relation missing.
- `auth.users(id)` — existence and exact key compatibility must be rechecked immediately before implementation.

The repository's `migrations/0001_auth.sql` defines Better Auth's `public."user"` and companion tables. Do not invent a replacement schema, and do not run all of 0001 blindly without checking the full Better Auth schema and migration ledger. First reconcile the missing `public."user"` prerequisite with the intended Better Auth schema and verify whether the other Better Auth relations are also missing or partially present.

Only after both referenced relations exist with compatible key types, and the migration owner approves the dependency repair, may the following source-aligned table definition be considered:

```sql
CREATE TABLE IF NOT EXISTS public.bridge_loop_identity_links (
  bridge_user_id text PRIMARY KEY
    REFERENCES public."user"(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL UNIQUE
    REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_method text NOT NULL CHECK (
    verification_method IN (
      'verified_email_reauthentication',
      'manual_documented_review',
      'supabase_auth_onboarding'
    )
  ),
  verified_at timestamptz NOT NULL,
  verified_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Blocked today:** because `public."user"` was reported missing, this DDL is not ready to run. No identity rows may be created or linked as part of this repair.

## 6. Default ACL — postgres / public only; provenance gate remains open

The prior catalog review reported broad defaults for role `postgres` in schema `public` on tables, sequences, and functions. The catalog does not reveal who created those defaults or when. The user has approved preparing a Staging-only proposal, but that does not establish provenance or authorize application.

If and only if Supabase support/audit evidence confirms these are project-managed defaults for the intended migration owner `postgres`, the following schema-scoped statements may be considered:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
```

These statements affect future objects created by `postgres` in `public`; they do not revoke existing-object ACLs. They do not remove privileges granted to `PUBLIC` by a global default ACL. PostgreSQL per-schema default-privilege revokes cannot cancel a global default grant. If the current function default includes global `PUBLIC EXECUTE`, do not attempt to fix it by broadening this change across all schemas. Obtain a separately reviewed global-default plan or explicitly grant/revoke per function at creation time.

**Do not run these statements until default ACL provenance, current raw ACL entries, and the exact migration owner are confirmed.** Do not modify defaults for `supabase_admin`, `supabase_auth_admin`, or any platform schema.

## 7. 0012 / 0013 disposition under Option A

- Do not apply `0012_bridge_rls_identity_binding.sql` as a partial migration. Its authenticated SELECT policies create a browser-read surface that Option A does not require, and its helper functions depend on the missing identity-link relation.
- Do not apply `0013_harden_bridge_rls_helpers.sql` independently. The four helper functions are absent in Staging; 0013 depends on them.
- Under Option A, no browser-facing RLS read policy is being introduced. Existing RLS remains enabled as defense in depth; the intended API boundary is enforced by privileges and server-side authorization.
- Any future helper functions must be designed and tested for server-side use, with explicit function EXECUTE grants limited to the actual server role. Do not assume `service_role` is the same credential as the app's direct Postgres `postgres` connection.

## 8. Required post-change verification — if separately approved in the future

1. Re-query effective table privileges for `anon`, `authenticated`, and `service_role` across all 32 public tables.
2. Re-query sequence USAGE/SELECT/UPDATE for all five sequences.
3. Re-query column-level ACLs, views, materialized views, functions, and PUBLIC privileges.
4. Verify RLS remains enabled on all 32 tables; do not add policies for Option A.
5. Create a new test table/function/sequence under the intended migration owner in a disposable Staging test schema or isolated test project to validate default ACL behavior; do not create test objects in the canonical Staging public schema without separate approval.
6. Verify application server routes still function using server-side credentials and browser Data API requests fail closed.
7. Confirm no data rows were inserted, updated, or deleted and no Loop title became published/authorized as a side effect.
8. Record evidence in GitHub and keep Production out of scope.

## 9. Rollback and operational note

No rollback SQL is supplied because no change is authorized and the exact pre-change ACL/grantor state must be captured first. A future implementation must preserve a complete before-image of each ACL and default ACL, including grantors and grant options, before mutation. Do not assume `GRANT ALL` is a safe rollback.

## Final status

- Option A: accepted as the design direction for this draft.
- SQL: proposed snippets only; not applied.
- Missing identity-link prerequisite: blocked by missing `public."user"`.
- Publication table: schema-only extraction possible; do not replay data-mutating migration 0006.
- `postgres/public` default ACL: proposal drafted; provenance still requires authoritative confirmation.
- Production: **HOLD / NOT CERTIFIED / NO-GO**.


## Review addendum — CI and dependency completeness gate (31 Oct 2026)

### Repository checks

For PR #439 head `d65b3e2c999705e859e430db5d7c06316f496ae9`:

- GitHub CI workflow run `41174272581`: both `gate` and `workflow-postgres` jobs completed successfully.
- Vercel status `Vercel – media-factory`: success.
- These checks validate the repository build/test workflow and Vercel check only. They do **not** validate this SQL against canonical Staging, prove ACL safety, or certify the release.

### SQL draft review — blockers before implementation

1. **The publication-table DDL is not a complete Loop schema repair.** Migration `0006_loop_canonical.sql` also defines `loop_titles`, `loop_profiles`, `loop_watch_progress`, `loop_watchlist`, `loop_subscriptions`, `loop_entitlements`, and indexes. The current draft isolates only `bridge_loop_publications`. The other Loop relations were reported missing in the prior Staging inventory. Do not treat this isolated table as resolving the full Loop schema or runtime dependency set.
2. **Do not replay migration 0006.** It inserts Jananam Bridge/publication/Loop rows and explicitly updates the Loop title to `published=true`, `listed=true`, and `status='approved'`. A separate schema-only inventory and dependency map is required before any Loop DDL is proposed.
3. **Identity-link dependency remains blocked.** `bridge_loop_identity_links` references `public."user"` and `auth.users`. The first was reported missing in Staging. Do not create the identity-link table until the intended Better Auth schema, exact key types, existing companion relations, and migration ledger are reconciled. No identity records or links are in scope.
4. **Table and sequence revokes are not a universal access-denial proof.** The statements only revoke direct ACL entries for `anon` and `authenticated`; they do not by themselves remove column-level grants, grants to `PUBLIC`, or privileges inherited through role memberships. The implementation preflight and postflight must explicitly test these paths and stop if effective access remains.
5. **Default ACL statements remain blocked.** Current catalog output identifies defaults by owner/schema/object type but does not identify the actor or timestamp that installed them. Do not apply `ALTER DEFAULT PRIVILEGES` until authoritative provenance confirms the `postgres/public` defaults are project-managed and `postgres` is the intended migration role. Schema-specific revokes also cannot cancel global default grants to `PUBLIC`.
6. **Current RLS posture is defense-in-depth, not a substitute for ACL verification.** Keep RLS enabled; do not add browser-facing policies under Option A. Verify browser Data API requests fail closed and server-side application routes continue to work before any future repair is considered.

### Review disposition

**NOT READY FOR EXECUTION.** The SQL snippets remain review material only. Before an implementation PR can be prepared, complete a separate read-only dependency inventory for all Loop relations, Better Auth relations, table/sequence owners, direct and column ACLs, PUBLIC grants, role inheritance, and default ACL provenance.

No SQL was executed; no database, role, policy, identity, data, deployment, or Production state was changed.
