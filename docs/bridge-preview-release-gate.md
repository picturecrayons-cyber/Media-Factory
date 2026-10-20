# Crayons Bridge preview release gate

## Purpose

This workflow is a preview-only **configuration preflight**. It does not deploy, merge, mutate production data, or contact OCI, Supabase, or Razorpay APIs. It checks explicit isolation markers and exact candidate SHA before a live test is authorized.

## Required GitHub configuration

Create/verify the GitHub Actions environment named `bridge-preview-storage`. Configure only preview credentials there. Do not paste secret values into issues, logs, or chat.

**Environment secrets**
- `BRIDGE_PREVIEW_DATABASE_URL`: disposable PostgreSQL connection string, not production or the shared staging project.
- `OCI_TENANCY_OCID` and `BRIDGE_PREVIEW_OCI_TENANCY_OCID`: must identify the same dedicated preview tenancy.
- `OCI_USER_OCID`, `OCI_PRIVATE_KEY`: preview-only OCI principal.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`: test-mode credentials only; key ID must use the provider test-mode prefix.

**Environment variables**
- `BRIDGE_PREVIEW_DATABASE_DISPOSABLE=true`: explicit owner attestation that the database is disposable.
- `BRIDGE_PREVIEW_SUPABASE_URL=https://bbtrosuwisnxacuxvegt.supabase.co`: staging application URL, never the production project.
- `OCI_REGION`, `OCI_NAMESPACE`, `OCI_BUCKET_NAME`.
- `BRIDGE_PREVIEW_OCI_BUCKET`: exact allowlisted preview bucket; must equal `OCI_BUCKET_NAME`.

The workflow fails closed if a required value is absent, if the selected ref and candidate SHA differ, if the database host is production/shared staging, if OCI tenancy/bucket do not match the preview allowlist, or if the Razorpay key is not test mode. The preflight never prints secret values.

## Run

1. Verify the environment name, variable names, and secret names in GitHub Settings. Do not expose values.
2. Dispatch **Bridge Preview Release Gate** on the exact candidate branch/ref.
3. Supply the full SHA of that ref as `candidate_sha`.
4. Confirm the workflow reports all preflight checks as PASS. This is configuration evidence only, not an OCI test result.
5. Attach the run URL, tested SHA, result, and redacted logs to GitHub Issue #314.

## Limits and safety holds

The existing `scripts/oci-production-e2e.mjs` attempts to delete generated objects but suppresses cleanup errors. It must not be used to certify cleanup until that behavior is fixed and tested. For that reason this workflow intentionally does **not** execute live OCI operations yet.

This workflow does **not** cover live OCI upload/download, browser CORS/ETag, retry/resume/abort, Razorpay webhook replay/reconciliation, role-separated authorization, accessibility, or independent approval. Those gates remain open until separate evidence is attached. Do not mark certification complete based on this workflow alone.
