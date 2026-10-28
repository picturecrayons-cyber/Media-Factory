# Supabase Preview reconciliation — 2026-10-28

## Current evidence

- Canonical repository: `picturecrayons-cyber/Media-Factory`.
- CI run #1761 on `main` at `b1600394bc90dfff404fb2e2c5b0c68237e6e0ec` succeeded. It ran application build/typecheck/lint/tests and a temporary PostgreSQL workflow; this does not certify the Supabase Preview integration.
- Supabase Preview reported: `Remote migration versions not found in local migrations directory.`
- Supabase project `mlmgugivsyoxzdgwkbpu` is named Crayons Bridge and is the production project. Supabase branch listing exposes only default `main`, with `project_ref=mlmgugivsyoxzdgwkbpu`, `parent_project_ref=mlmgugivsyoxzdgwkbpu`, `is_default=true`, `status=MIGRATIONS_FAILED`. No separately isolated preview branch is presently identified.
- Remote migration history currently ends at `20261016161255`; repository contains `supabase/migrations/20261027_story_concept_submission.sql` newer than that record.
- Schema objects already exist in Production: `bridge_story_concept_submissions`, `bridge_buyer_interest`, and `bridge_titles.submission_type`. The story migration version itself is not in the remote migration list. That establishes possible schema/history drift; it does not establish which exact remote versions are absent from the repository.
- Production has two policies on `bridge_story_concept_submissions`; `bridge_buyer_interest` has RLS enabled but no policies. The release plan classifies `bridge_buyer_interest` as server-only and says to keep client roles denied where client access is not required. Do not add permissive policies to make Preview green.
- GitHub Actions Bridge OCI Storage E2E run #44 failed at commit `8bb087d70b8b56643ba7b3729c9516807473ca00` because `BRIDGE_E2E_ASSET_ID` was empty (`STORAGE_E2E_BLOCKED missing: BRIDGE_E2E_ASSET_ID`). The current workflow name and script indicate a production round-trip. Do not rerun it until the workflow and all referenced credentials/database/bucket/test asset are verified non-production.

## Full repository-to-history reconciliation — read-only

Repository tree inspected at `main` commit `b1600394bc90dfff404fb2e2c5b0c68237e6e0ec`:

- `supabase/migrations/` contains **10 SQL files**.
- The separate legacy `migrations/` directory contains **27 SQL files**, including repeated numeric prefixes such as `0018` and `0020`. These files are not in the Supabase CLI migration directory and cannot automatically substitute for timestamped files under `supabase/migrations/`.
- The Supabase database records approximately **50 migration versions**, with its latest listed version `20261016161255`. Most remote versions do not have a corresponding timestamped filename in the current `supabase/migrations/` directory. This matches the reported local/remote migration-version mismatch and means the story migration is not the only reconciliation item.
- Two files in `supabase/migrations/` share the same version prefix `20261006230000`:
  - `20261006230000_bridge_commercial_engine.sql`
  - `20261006230000_duplicate_title_reconciliation.sql`
  A timestamp-based migration runner may treat these as a duplicate version. Do not rename or reorder them without verifying the intended canonical history and the migration runner's exact behavior.
- Two files use short date prefixes rather than the usual 14-digit timestamp format:
  - `20260921_crayons_bridge_rls.sql`
  - `20261004_bridge_assets_add_censor_certificate.sql`
  Their compatibility with the configured migration runner must be checked.
- The root-level legacy migration filenames do not provide a reliable one-to-one mapping to the remote version/name records. A mapping must be explicitly reviewed; matching table names or SQL intent is not proof that a migration's effects and history are equivalent.
- This is a repository-level finding, not a complete semantic equivalence proof. The full remote history and all migration contents still need a controlled, isolated comparison before any history repair is considered.

## Safe reconciliation plan

1. Confirm project integration settings in Supabase Dashboard > Project Settings > Integrations. Check repository, working directory (`.` if `supabase/` is at repo root), production-branch settings, and whether automatic branching is enabled. The current Supabase connector cannot prove these project-level integration settings.
2. Establish an isolated, non-production Supabase Preview branch/project with a distinct project ref. Verify its API URL and database endpoint are not the production ref before running any writes.
3. Build a version-by-version mapping of all remote history rows to tracked migration files, including legacy files and duplicate/irregular timestamps. Identify missing remote versions, local-only versions, duplicate versions, and schema objects that exist outside tracked migrations. Do not infer all missing versions from the newest filename alone.
4. Test the complete intended migration sequence on an isolated disposable database. Review the story migration's table definitions and FK types (`bridge_titles.id` must match `title_id`), service-catalog schema, grants, RLS, and all existing policies. Preserve `bridge_buyer_interest` as server-only unless a separately reviewed access design proves client access is required.
5. Only after schema-equivalence is proven, use the documented migration-history repair mechanism against the isolated target, if needed. Migration repair changes tracking records only; it does not execute SQL. Never repair or reset Production as a way to clear this check.
6. Update the OCI E2E workflow so it targets an explicitly named preview GitHub Environment and preview-only resources; fail closed if the asset ID, database target, or bucket isn't clearly non-production. No empty/missing required variables should reach the test.
7. Rerun the Supabase Preview check and isolated OCI E2E check on an exact commit SHA. Record evidence. Keep Production HOLD / NOT CERTIFIED until gates pass and the project-target boundary is verified.

## Not done

No Production database, migration history, RLS, authentication settings, OCI objects, payment records, email, Vercel environment, or Production deployment was changed by this investigation. No branch reset, rebase, or merge was performed.

## Source references

- Supabase Database Migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase Branching: https://supabase.com/docs/guides/deployment/branching
- Supabase GitHub Integration: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase Branching Troubleshooting: https://supabase.com/docs/guides/deployment/branching/troubleshooting
- Canonical release plan: `docs/release/isolated-preview-security-integration-plan.md`
