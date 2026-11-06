# Crayons Bridge Testing DB RLS & Provenance Validation Report

**Date:** 2026-11-06  
**Environment:** STAGING / Testing DB only  
**Supabase project:** `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB, ap-south-1, PostgreSQL 17.11)  
**Production:** untouched; remains HOLD / NOT CERTIFIED / NO-GO

## 1. Changes applied

| Change | Testing DB migration ledger name | Result |
|---|---|---|
| Workspace RLS helpers and policies | `bridge_testing_workspace_rls_20261106` | APPLIED |
| Asset provenance columns and provider allow-list | `bridge_asset_storage_provenance_0022_20261106` | APPLIED |
| Remove direct title-update policy; retain server-authoritative mutation | `bridge_titles_no_browser_update_policy_20261106` | APPLIED |

Repository migrations:
- `migrations/0024_bridge_testing_workspace_rls.sql`
- `migrations/0022_bridge_asset_storage_provenance.sql`

The provider allow-list is enforced by a CHECK constraint (not a PostgreSQL ENUM type): `oci`, `aws_s3`, `cloudflare_r2`.

## 2. RLS inventory

The Testing DB audit initially identified 43 public tables with RLS enabled and no policies.

After remediation:
- 10 workspace tables have 17 explicit policies.
- 33 remaining RLS-enabled tables have no policies.
- A fresh privilege audit returned zero table grants to `anon` or `authenticated` across the public schema. The remaining 33 are intentionally server-only; no blanket authenticated grants were added.

Workspace policy intent:
- Creator: own draft/title rows.
- Studio: own title or active organization membership.
- Buyer: published title visibility only when title-specific access and publication gates pass; no direct asset-table metadata.
- Verified internal staff: role-gated internal read access.
- `super_admin`: no implicit global bypass.
- Direct title updates remain server-authoritative.

## 3. Live Testing DB RLS assertions

A rollback-only transaction temporarily granted only the privileges needed to exercise RLS under the `authenticated` role. The grants and synthetic fixtures were rolled back.

| Assertion | Result |
|---|---|
| Creator reads own draft | PASS |
| Creator inserts own draft | PASS |
| Buyer cannot read unpublished title | PASS |
| Buyer cannot read asset metadata | PASS |
| Buyer draft insert denied | PASS |
| Verified admin reads workspace | PASS |
| `super_admin` has no global bypass | PASS |

A post-rollback query confirmed zero synthetic fixture titles remained. A separate post-test privilege audit confirmed zero anon/authenticated public-table grants.

## 4. Provenance constraint checks

Testing DB accepted one rollback-only fixture for each allowed provider:
- `oci`
- `aws_s3`
- `cloudflare_r2`

An invalid provider value was rejected by `bridge_assets_storage_provider_check`.

The five columns were verified on `public.bridge_assets`:
- `storage_provider`
- `storage_bucket`
- `storage_namespace`
- `storage_region`
- `storage_endpoint`

The provider and bucket lookup indexes were verified in `pg_indexes`.

## 5. Automated test results

PR #485:
- GitHub Actions CI: PASS
- Scope A PostgreSQL Onboarding Verification: PASS

PR #486:
- GitHub Actions gate: PASS
- workflow-postgres: PASS

PR #490:
- GitHub Actions gate: PASS
- workflow-postgres: PASS

The latest test output recorded 159 tests passed, 0 failed. Regression coverage includes:
- verified upload persists OCI provider, bucket, namespace, region, endpoint;
- allowed provider values and invalid-provider rejection;
- Buyer response redacts object keys and all provenance;
- Studio response retains expandable provenance fields.

## 6. Explicitly NOT VERIFIED / blocked

- No live OCI multipart upload or object HEAD verification was performed.
- Migration 0023 (which adds `checksum_sha256` and multipart-session schema) was not applied. The current upload-confirmation regression uses an ETag fixture; it does not prove cryptographic SHA-256 computation or persistence. SHA-256 verification remains NOT VERIFIED.
- No real Buyer/Studio browser session was exercised against a deployed Preview.
- No authenticated visual screenshot/DOM acceptance test was performed for the Studio layout.
- Supabase Preview check is skipped because Supabase branch previews are not associated/enabled.
- Vercel status remains failed due to the team's build-rate limit. The latest available READY deployment for the UI branch points to an older commit, not the current PR head.
- The three work branches have branch-scoped Preview environment placeholders with empty values and fail-closed comments; they are not certified staging runtime configurations. A verified plaintext Testing-only connection value and publishable key must be provisioned before runtime tests. No production environment variable was changed.

## 7. Release decision

**Production remains HOLD / NOT CERTIFIED / NO-GO.**  
The database security and schema work is applied to Testing DB and the automated repository checks pass. Live OCI and authenticated Preview validation remain blocked and must pass before any release certification. No PR was merged and no Production deployment or database mutation occurred.
