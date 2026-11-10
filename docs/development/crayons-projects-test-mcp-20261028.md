# Crayons Projects — isolated Supabase testing setup

## Purpose
This configuration is for development and testing of **Crayons Projects only**. It must not be used as a production database connection.

## Environments — do not mix
- **Dedicated testing Supabase project:** `jbymleftneggcgutlcqu` — `Crayons Projects - Testing DB`, Mumbai (`ap-south-1`).
- **Crayons Bridge Production Supabase project:** `mlmgugivsyoxzdgwkbpu`. Leave unchanged under the active Production HOLD / NOT CERTIFIED / NO-GO.
- **Canonical code repository:** `picturecrayons-cyber/Media-Factory`.
- Git branches are code branches. A Supabase project's dashboard branch label (such as `main` / `Production`) is not the same as a GitHub branch and does not by itself prove which database an application or workflow uses.

## Test-only Supabase MCP
Use this URL for the interactive MCP connection to inspect the testing database:

```
https://mcp.supabase.com/mcp?project_ref=jbymleftneggcgutlcqu&read_only=true
```

- Scope is fixed to the test project using `project_ref=jbymleftneggcgutlcqu`.
- `read_only=true` is for inspection and cannot be used to apply the test migrations.
- Authenticate through the MCP client's Supabase OAuth flow. Keep manual approval of tool calls enabled.
- Do not remove the project scope or change this URL to the Production project.
- MCP settings are saved by the user in the ChatGPT MCP configuration; this repository document records the intended canonical test URL but does not itself connect ChatGPT.

## Test-only GitHub Actions workflow requirements
Before a workflow writes to Supabase:
1. Use a dedicated GitHub Actions Environment named `crayons-projects-test` (or another explicitly test-labelled environment), never the `production` environment.
2. Store independently created **test-only** credentials in that environment's protected secrets. Do not copy Production database passwords, Supabase secret/service-role keys, payment, email, or OCI Production credentials.
3. Make the expected project ref an explicit non-secret variable, e.g. `SUPABASE_PROJECT_REF=jbymleftneggcgutlcqu`. Validate it against this exact literal before any write, and fail closed on missing or mismatched values.
4. Print only the expected project ref and safe migration status in logs. Never print secrets or connection strings.
5. Start with schema/history inspection. Reconstruct and review the complete migration sequence and handle the two local files sharing version `20261006230000` deliberately; do not guess, rename automatically, or copy the Production migration history.
6. Apply the reviewed migrations only to the dedicated test project. Verify schema objects, grants, RLS/policies, and migration history after application.
7. The existing CI `workflow-postgres` uses a temporary PostgreSQL service; passing that job is not evidence that this Supabase testing project was migrated.
8. Do not configure the existing Vercel `bridge` Production environment to use this test database. If a Vercel preview integration is later needed, use only an explicitly scoped, test-only Preview/custom environment after verifying its project and environment boundaries.

## Vercel boundary
The existing Vercel project `bridge` remains linked to `picturecrayons-cyber/Media-Factory`. Its Production deployment/settings are not to be changed for this task. Do not create a duplicate Vercel project merely to record this configuration. Any future Preview environment work must not alter Production variables or deployment targets.

## Current verified baseline (2026-10-28)
- Testing project ref: `jbymleftneggcgutlcqu`; status `ACTIVE_HEALTHY`; Postgres 17; region Mumbai.
- At baseline: no public tables, no recorded Supabase migrations, and no Supabase development branches.
- Production ref: `mlmgugivsyoxzdgwkbpu`; no changes authorized or made.
- No test-project migrations have been run yet.
- Existing release/reconciliation PR #413 remains an independent draft; do not merge it as part of MCP setup.
- Production remains HOLD / NOT CERTIFIED / NO-GO until the database migration and OCI E2E gates are independently certified.

## Supabase Agent Skills (optional; run locally in a trusted coding terminal)
Install project-scoped skills from the repository root:
```bash
npx skills add supabase/agent-skills
```
For Postgres/schema work, install the additional best-practices skill if needed:
```bash
npx skills add supabase/agent-skills --skill supabase-postgres-best-practices
```
These commands are not run by ChatGPT MCP configuration and do not connect ChatGPT; they add instructions to the local coding project.

## References
- Supabase MCP: https://supabase.com/docs/guides/ai-tools/mcp
- Supabase GitHub integration: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase migrations workflow: https://supabase.com/docs/guides/local-development/cli-workflows
