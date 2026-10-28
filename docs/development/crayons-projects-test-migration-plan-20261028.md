# Crayons Projects — test database migration plan

## Verified target

- Test project: `Crayons Projects - Testing DB` / `jbymleftneggcgutlcqu`, Mumbai, PostgreSQL 17, healthy.
- Crayons Bridge production project: `mlmgugivsyoxzdgwkbpu`. This plan does not connect to it.
- Current test baseline: zero recorded application migrations and zero public application tables. Supabase-managed `auth`, `storage`, and other system schemas exist as expected.
- Current workflow result: CI `gate` and `workflow-postgres` succeeded, but the latter uses a temporary PostgreSQL container and is not evidence that this Supabase project was changed.

## Migration execution status: BLOCKED_PENDING_BASELINE

**No SQL migration has been applied to the test project.** A direct timestamp-order run is unsafe.

Reasons:
1. The fresh test project has no `public.bridge_titles`, `public.bridge_assets`, `public.bridge_payments`, or `public.bridge_service_catalog` baseline tables required by current files.
2. `20260921_crayons_bridge_rls.sql` is only an RLS adjustment with `ALTER TABLE IF EXISTS`; it is not a schema bootstrap. Its comments name another project ref (`uakpqqardziifcwzvgfx`) and explicitly caution against production use.
3. Two SQL files have identical migration version `20261006230000`, preventing a deterministic ordered migration chain until resolved in a reviewed change.
4. The legacy `migrations/` folder has additional duplicate numeric prefixes and is not interchangeable with the Supabase timestamped migration directory.
5. The Story Concept submission migration requires Bridge baseline and commercial tables.

## Safe workflow

The accompanying `.github/workflows/crayons-projects-test-migrations.yml` is deliberately a non-writing guard. It runs only by manual dispatch under GitHub Environment `crayons-projects-test`, fails closed unless `vars.SUPABASE_PROJECT_REF` exactly matches `jbymleftneggcgutlcqu`, and verifies that the manifest remains blocked. It does not need Supabase credentials and cannot run SQL migrations.

Before enabling database writes:
1. Decide whether this target should receive the full Crayons Bridge schema or only the Crayons Projects module.
2. Find/prepare the canonical schema bootstrap and dependency graph.
3. Resolve duplicate migration versions explicitly in a reviewed branch.
4. Test all selected SQL files against a disposable local PostgreSQL 17 database and verify RLS/grants, functions, indexes, constraints and application dependencies.
5. Configure a protected GitHub Environment named `crayons-projects-test` with test-only credentials generated for this project. Confirm its project-ref variable is exactly `jbymleftneggcgutlcqu`; do not copy Production secrets.
6. Introduce a separate explicitly reviewed write-enabled workflow after the read-only plan passes. Assert the project ref in code before any write and verify migration history/schema afterward.
7. Keep Vercel `bridge` Production settings and production database `mlmgugivsyoxzdgwkbpu` untouched.

## Read-only MCP

`https://mcp.supabase.com/mcp?project_ref=jbymleftneggcgutlcqu&read_only=true`

This URL is inspection-only. It cannot execute migrations.
