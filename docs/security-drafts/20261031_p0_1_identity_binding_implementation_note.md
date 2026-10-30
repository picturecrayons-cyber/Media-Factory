# P0-1 identity-binding implementation note

Date: 2026-10-31
Repository: `picturecrayons-cyber/Media-Factory`
Base branch: `main`
Base commit: `2123a9983e6ef9c105d77824958cd9b784babb43`

## Scope

This change set corrects the Bridge-to-Supabase identity binding source path and adds regression coverage. It does not apply migrations, change any database, deploy, or merge.

## Source evidence

- `migrations/0004_bridge.sql` defines `public.bridge_profiles.user_id` as a text primary key.
- `migrations/0007a_identity_links.sql` previously referenced `public."user"(id)`, which is not the identity table used by the reviewed application onboarding flow.
- `src/lib/bridge/profiles.ts` creates the Bridge profile using the verified Supabase Auth ID and persists the explicit identity link in the same transaction.
- The reviewed Staging project reported no `public.bridge_loop_identity_links` table and no `public."user"` table; its `bridge_profiles` table had zero rows at the time of inspection.
- Staging's `supabase_migrations.schema_migrations` contained 13 records with test-prefixed names. These records are not an exact filename ledger for the repository's top-level migration runner.
- The Staging catalog query found no `_migrations` table. The runner source uses filename-based bookkeeping in `public._migrations`. Therefore the Staging Supabase migration ledger cannot prove which top-level repository migration files the runner applied.

## Changes in this branch

1. Change the identity-link FK to `public.bridge_profiles(user_id)`; retain the Supabase Auth FK to `auth.users(id)`.
2. Remove email-equality fallback from `resolveBridgeUserId`.
3. Preserve the direct same-ID profile path before querying the identity-link table, so existing same-ID profiles do not depend on that table being present.
4. Include existing onboarding atomicity/conflict regression tests in `npm test`.
5. Add focused identity-resolution unit tests for explicit-link fallback and removal of email-based adoption.

## Verification limits

- No migration was applied.
- No Staging SQL write was performed.
- The new and included tests have not been executed in this connector-only workflow.
- No live onboarding, concurrent onboarding, or database transaction E2E was run.
- The test-prefixed Supabase ledger records remain unreconciled to exact source file execution.

## Release posture

Production remains HOLD / NOT CERTIFIED / NO-GO. This branch is a review candidate only.
