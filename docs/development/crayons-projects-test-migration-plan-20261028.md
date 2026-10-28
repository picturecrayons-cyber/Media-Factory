# Crayons Projects — test database migration plan

## Verified target

- Test project: `Crayons Projects - Testing DB` / `jbymleftneggcgutlcqu`, Mumbai, PostgreSQL 17, healthy.
- Crayons Bridge production project: `mlmgugivsyoxzdgwkbpu`. This plan does not connect to it.
- Current test baseline: zero recorded application migrations and zero public application tables. Supabase-managed `auth`, `storage`, and other system schemas exist as expected.
- Current workflow result: CI `gate` and `workflow-postgres` succeeded, but the latter uses a temporary PostgreSQL container and is not evidence that this Supabase project was changed.

## Migration execution status: BLOCKED_SOURCE_RECONSTRUCTION

**No SQL migration has been applied to the test project.** A direct timestamp-order run is unsafe. The production migration ledger has 52 recorded versions, but the current repository does not contain exact SQL sources for every version. See `docs/development/crayons-projects-production-migration-source-map-20261028.json` for the version-by-version source map.

Reasons:
1. The fresh test project has no `public.bridge_titles`, `public.bridge_assets`, `public.bridge_payments`, or `public.bridge_service_catalog` baseline tables required by current files.
2. `20260921_crayons_bridge_rls.sql` is only an RLS adjustment with `ALTER TABLE IF EXISTS`; it is not a schema bootstrap. Its comments name another project ref (`uakpqqardziifcwzvgfx`) and explicitly caution against production use.
3. Two SQL files have identical migration version `20261006230000`, preventing a deterministic ordered migration chain until resolved in a reviewed change.
4. The legacy `migrations/` folder has additional duplicate numeric prefixes and is not interchangeable with the Supabase timestamped migration directory.
5. The Story Concept submission migration requires Bridge baseline and commercial tables.
6. The legacy `0018_bridge_service_revenue_engine.sql` and the newer commercial-engine migration define overlapping objects with different schema expectations; they must not be combined without an explicit canonical decision.
7. The 52-version production history includes missing-source, candidate-only, and version-divergence entries. Candidate files are not proof of exact historical SQL.

## Safe workflow

The accompanying `.github/workflows/crayons-projects-test-migrations.yml` is deliberately a non-writing guard. It runs only by manual dispatch under GitHub Environment `crayons-projects-test`, fails closed unless `vars.SUPABASE_PROJECT_REF` exactly matches `jbymleftneggcgutlcqu`, and verifies that the manifest remains `BLOCKED_SOURCE_RECONSTRUCTION` and that all 52 production history entries are represented. It remains non-writing. It does not need Supabase credentials and cannot run SQL migrations.

Before enabling database writes:
1. Decide whether this target should receive the full Crayons Bridge schema or only the Crayons Projects module.
2. Find/prepare the canonical schema bootstrap and dependency graph.
3. Recover exact SQL for missing historical versions and compare candidate sources against the applied SQL.
4. Resolve duplicate migration versions explicitly in a reviewed branch.
5. Test the complete reconstructed sequence against a disposable PostgreSQL 17/Supabase database and verify RLS/grants, functions, indexes, constraints and application dependencies.
6. Configure a protected GitHub Environment named `crayons-projects-test` with test-only credentials generated for this project. Confirm its project-ref variable is exactly `jbymleftneggcgutlcqu`; do not copy Production secrets.
7. Introduce a separate explicitly reviewed write-enabled workflow after the read-only plan passes. Assert the project ref in code before any write and verify migration history/schema afterward.
8. Keep Vercel `bridge` Production settings and production database `mlmgugivsyoxzdgwkbpu` untouched.

## Read-only MCP

`https://mcp.supabase.com/mcp?project_ref=jbymleftneggcgutlcqu&read_only=true`

This URL is inspection-only. It cannot execute migrations.
