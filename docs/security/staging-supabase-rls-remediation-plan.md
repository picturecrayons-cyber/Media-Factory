# Staging Supabase RLS remediation plan (review only)

**Status: draft / NOT approved for execution.**  
Target: staging project `bbtrosuwisnxacuxvegt` only. Never point this plan at production project `mlmgugivsyoxzdgwkbpu`.

## Observed staging evidence (read-only, 2026-10-13)

- 38 public tables have row-level security (RLS) disabled.
- 25 of those have at least one table privilege granted to `anon`; 25 have at least one privilege granted to `authenticated`.
- Six tables have policies defined while RLS is disabled, so those policies are not enforcing row-level filtering.
- Advisor also reports RLS-enabled tables without policies and functions with mutable `search_path`; review individually.
- Schema inspection confirms high-risk tables such as `account` (contains credential/token columns), `session` (session tokens), `verification`, `profiles` (includes PIN field), `entitlements`, `subscriptions`, `revenue_events`, `screeners`, `transfers`, `submissions`, `config_revisions`, `titles`, `watchlist`, `qc_jobs`, `loc_jobs`, and `platform_meta` exist with RLS disabled in staging.
- This is an inventory, not proof that all data is currently internet-readable. Effective access depends on API exposure, grants, roles, policies, and service credentials; the exposure is serious enough to block E2E until corrected.

## Table-by-table decision matrix

Do not generate a blanket `ENABLE ROW LEVEL SECURITY` migration. For every relation, fill in the full inventory before implementation: table owner; columns; FK/tenant or owner key; API exposure; grants to `PUBLIC`, `anon`, `authenticated`; existing policies; server-side service-role access; application read/write call sites; intended role matrix; and negative tests.

| Relation / family | Initial security disposition | Policy requirements before allowing client access |
|---|---|---|
| `account`, `session`, `verification` | Server/auth adapter only; no direct browser access | Revoke unnecessary client-role privileges only after confirming the auth adapter's actual database role. Keep secrets/session tokens out of client responses. |
| `profiles`, `loop_profiles`, `bridge_profiles` | User-owned / profile-scoped | SELECT/UPDATE only where `auth.uid()` maps to the verified application identity; INSERT must bind owner to caller; no cross-user profile access. Verify custom text IDs and identity-link tables before writing policy SQL. |
| `watchlist`, `loop_watchlist`, `loop_watch_progress` | User-owned | All operations constrained by verified user ID; test user A cannot read/write user B's rows. |
| `subscriptions`, `loop_subscriptions`, `entitlements`, `loop_entitlements` | Server-authoritative billing/access state | Clients must not grant/update their own entitlement or subscription. Read-only self-scoped access only if required; writes via verified server/webhook path. |
| `revenue_events` | Server/webhook-only | No client insert/update/delete. Verify webhook signature, idempotency key, payment-to-user/title binding, and server-only DB role. |
| `screeners`, `transfers`, `qc_jobs`, `loc_jobs` | Operational/admin/server-only by default | Restrict mutations to explicit server roles; studio/user access must be ownership- and title-scoped; never expose screener tokens or transfer destinations unnecessarily. |
| `submissions`, `bridge_dmca_registrations` | Private submission / legal workflow | Submitter can create/read only their own allowed fields; staff review via server-enforced roles. Do not expose screener URLs or legal contact data broadly. |
| `titles`, `loop_titles` | Split public published metadata from private workflow data | Anonymous SELECT only for explicitly published/approved fields via a safe view or endpoint; draft, rights, storage keys, unpublished content and admin fields remain private. Writes require verified staff permissions. |
| `territories`, `platform_meta` | Public-read only if content is explicitly non-sensitive | No client writes. Confirm no secrets/config or operational state is stored here before granting read access. |
| `config_revisions` | Admin/server-only | No direct anonymous or ordinary authenticated access; payload is potentially sensitive. |
| `user`, `account`, `session`, `verification`, `_migrations` | Infrastructure/auth metadata | Do not expose through PostgREST to ordinary client roles. `_migrations` should be inaccessible to client roles. |
| Remaining RLS-disabled public tables (complete 38-table inventory required) | Fail closed until classified | Add exact table, columns, grants, owner/tenant key, policy design, and test IDs to this document before migration is authored. |

**Important:** The matrix above is a proposed classification, not executable policy SQL. Some application tables use plain text user IDs rather than Supabase UUIDs; do not write `auth.uid()::text` policies until identity mapping and auth model are verified. Existing app code may use a server-side database connection rather than PostgREST; inspect its effective DB role and every route before changing grants.

## Implementation gates before writing a migration

1. Verify Preview deployment's exact commit SHA and inspect the runtime server-only database target without printing credentials. Confirm project reference by non-secret metadata; keep DB mutation feature flag OFF.
2. Export a complete relation inventory: RLS/force-RLS flags, policies including `USING`/`WITH CHECK`, grants for `PUBLIC`/`anon`/`authenticated` and app roles, table owner, columns, primary/foreign keys, views/functions and security-definer behavior.
3. Search repository code for each table and identify the actual access path (Supabase client/PostgREST vs server SQL). Record required operations and caller role.
4. Produce explicit SQL per relation; default deny. Prefer server-only writes for identity, payment, entitlement, rights, storage and workflow state. Avoid broad grants and never expose service-role credentials.
5. Have a second reviewer inspect SQL and rollback before applying to staging. No Production execution.

## Rollback and recovery

- Take a verified staging backup/snapshot and record current grants, policies, RLS flags, schema/migration version and row counts before mutation.
- Apply changes in a reviewed, staging-only migration inside a transaction where supported; verify postconditions immediately.
- If application routes break, roll back the application release first while keeping the safer RLS/grant posture. Do **not** disable RLS or restore broad `anon` grants as an automatic rollback.
- Restore an old grant/policy only as a separately reviewed emergency change after proving it cannot re-expose protected data. Record every statement and verify advisor output after remediation.
- Keep production untouched. Never run against `mlmgugivsyoxzdgwkbpu`.

## Required negative and positive tests

- Unauthenticated requests cannot read auth/session/account tokens, private submissions, unpublished titles, entitlements, revenue, screeners or operational jobs.
- User A cannot read/update/delete User B's profile, watchlist, watch progress, subscription, entitlement, submission or private screener.
- Studio A cannot read/write Studio B's titles, rights evidence, submissions, media objects or workflow state.
- A normal authenticated user cannot mutate billing/entitlements, revenue, publication grants, title rights, QC status or storage location.
- Only an explicitly authorized staff role can perform its permitted workflow transition; author/reviewer/approver/publisher separation is enforced server-side.
- Published, eligible investor offers only are visible to eligible investors; ineligible investors see none; Investor A cannot read Investor B's interest; terms consent is recorded and checked server-side.
- Test each denial through the real Preview API with separate identities; SQL-only policy checks do not count as runtime E2E. Capture HTTP status/body without leaking personal data or tokens.

## Release status

**HOLD.** No staging or Production policy/grant/schema change is included in this document. Do not apply the investment-offer migration or perform role E2E until the exposure is remediated and the Preview database binding is confirmed. Exact-head CI + matching Preview + authenticated runtime E2E remain mandatory.
