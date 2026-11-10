# STAGING runtime verification — 2026-11-11

## Environment boundary

| Target | Action | Access | Risk / outcome |
|---|---|---|---|
| Supabase Testing DB `jbymleftneggcgutlcqu` | Additive schema, RLS, grants and indexes | WRITE (explicitly authorized) | STAGING only |
| GitHub Bridge + Loop feature branches | Code, tests, migration source, evidence, Draft PRs | WRITE (explicitly authorized) | Draft PRs only; no merge |
| Production DB `mlmgugivsyoxzdgwkbpu` | No operation | NO WRITE | HOLD / NOT CERTIFIED / NO-GO |
| Production Bridge / Loop | No operation | NO MERGE / NO DEPLOY | HOLD / NOT CERTIFIED / NO-GO |
| Vercel Preview | No deployment | NOT RUN | Build quota failure observed; no paid upgrade |

## Database and migration results

- STAGING migration history: 36 records; original 31 preserved.
- Original 31 migration statements reconciled: 10 byte-exact source matches, 1 SQL match after removing only the final newline, and 20 exact applied-SQL audit snapshots. See `staging-migration-reconciliation-2026-11-11.md`.
- No historical migration was replayed, rewritten, or deleted.
- All 36 migration history records have zero rollback statements recorded in Supabase. Guarded down scripts for the new migrations were dry-run inside explicit BEGIN/ROLLBACK transactions; all completed, then rolled back. Post-check: 61 tables, 71 policies, six Loop runtime tables and Bridge RPC ACL remained intact.
- Six Loop runtime tables now exist and remain empty: `loop_plans`, `loop_subscriptions`, `loop_user_tvod_entitlements`, `loop_payment_events`, `loop_watch_progress`, `loop_media_migration_queue`.
- Loop title foreign keys use TEXT to match `loop_titles.id`; no UUID conversion or legacy Loop baseline replay was performed.

## Security and effective access

- RLS enabled: 61/61 tables in `public` + `bridge_private`.
- RLS-enabled tables without any policy: 0.
- Supabase advisor `rls_enabled_no_policy`: 0 findings.
- `anon` table grants: 0.
- `authenticated` table grants: exactly SELECT/INSERT/UPDATE on `public.loop_watch_progress`; own-row RLS checks `auth.uid() = user_id`. No DELETE and no anon access.
- Payment, subscription, entitlement, payment-event, and media-migration-queue tables remain server-only.
- Six new Loop runtime tables grant CRUD only to `service_role`.
- Public wrapper `public.bridge_current_internal_role()`: authenticated EXECUTE=true; anon EXECUTE=false.
- The only function ACL entry inherited by browser roles outside the approved wrapper is a trigger-returning `bridge_private.prevent_verified_asset_pointer_mutation()`; it returns `trigger`, so it cannot be invoked as a normal PostgREST RPC. The Data API schema-exposure setting was not independently verified.
- Supabase Auth advisor still reports leaked-password protection disabled. This is an Auth project setting; it was not changed in this authorized DB migration scope.

## Identity and multi-Studio transaction tests

### Bridge ↔ Loop identity resolver

**PASS — transaction-only smoke test**

- Inserted a synthetic Auth user, verified Bridge profile and identity-link row inside a single transaction.
- Set the authenticated JWT subject and called `bridge_private.current_user_id()` as `authenticated`.
- Returned the expected Bridge `user_id`; public role wrapper returned null for a non-internal Creator profile.
- Rolled back the transaction.
- Follow-up counts for the synthetic Auth user, Bridge profile and identity link: all 0.

This proves the database identity resolver path, not a real browser login or Preview session.

### Multiple active Studio memberships

**PASS — transaction-only smoke test**

- Inserted one synthetic verified Studio profile, two synthetic active organizations and two active memberships for the same user.
- The query returned 2 active memberships.
- Legacy `bridge_organization_memberships_one_active_org_per_user` index: absent.
- New non-unique `bridge_organization_memberships_user_status_org_idx`: present.
- Rolled back the transaction.
- Follow-up counts for synthetic user, profile, organizations and memberships: all 0.

Bridge code now loads all active memberships, lists titles/story concepts across memberships, offers selected-Studio switching, and restricts membership grants to super admins. Real user-session multi-Studio E2E remains NOT VERIFIED.

## Loop publication / TVOD fail-closed test

- Called the STAGING fulfillment function with a nonexistent Loop title and synthetic payment/order identifiers.
- Expected `Publication unavailable` response received.
- No payment event or entitlement was written.
- No Razorpay order was created; no live or test payment was initiated.
- No Hostinger email or customer email was sent.

## GitHub evidence

- Bridge PR #547: Draft. Build, typecheck, ESLint, npm tests, secret scan and PostgreSQL workflow all PASS on the verified commit.
- Loop PR #180: Draft. A previous CI run exposed test fixture failures; those fixtures were corrected and a newer CI run is in progress. Do not treat Loop CI as PASS until that run completes.
- No PR was merged.

## Remaining release gates

| Gate | Status | Reason |
|---|---|---|
| STAGING migration inventory | PASS | Applied SQL + hashes reconciled; 20 historical source files archived as snapshots |
| STAGING schema / RLS | PASS | 61/61 RLS; 0 no-policy findings |
| Table grants | PASS | Browser access limited to own watch progress |
| Bridge identity resolver | PASS (DB transaction) | Real browser/Preview login still NOT VERIFIED |
| Multi-Studio DB model | PASS (DB transaction) | Real user session and invitation workflow E2E still NOT VERIFIED |
| Loop app tests | BLOCKED | Latest GitHub Actions run pending |
| Bridge + Loop Preview | NOT VERIFIED | No Preview deployment performed |
| Razorpay test-mode E2E | NOT VERIFIED | No payment order or payment initiated |
| Media playback with verified asset | NOT VERIFIED | STAGING has no verified Bridge asset/title fixtures |
| Backup / restore | NOT VERIFIED | No backup/restore drill performed |
| Production release approval | NO-GO | Separate Production approval required |

## No-regression rule

No Production database, environment, domain, deployment, payment or customer email operation was performed. `App-inu pani kittaruthu.`
