# Bridge delivery jobs — updated production ACL evidence and STAGING gate

Status: READ-ONLY verification + proposal artifact only. No SQL executed.
Production: mlmgugivsyoxzdgwkbpu. STAGING: jbymleftneggcgutlcqu.

## Latest raw ACL snapshot

PRODUCTION: public.bridge_delivery_jobs exists. Owner postgres. RLS enabled; FORCE RLS false. relacl snapshot: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}. No column-level ACL entries were returned. Columns: id, title_id, job_type, status, assigned_vendor, delivery_receipt_url, admin_sign_off, created_at, updated_at, requested_by, request_note.

STAGING: public.bridge_delivery_jobs does not exist. No columns or ACL available. Therefore the ACL correction cannot yet be exercised or regression-tested in STAGING. Do not create the table solely to test this ACL change.

## Proposed ACL change

See bridge_delivery_jobs_acl_correction.proposal.sql in this directory. It is intentionally outside supabase/migrations and named .proposal.sql. It is not deployable migration source.

Proposed change revokes all direct table privileges from PUBLIC, anon, authenticated. It preserves postgres ownership, existing RLS policy, and service_role grants. It includes preflight, fail-closed target existence check, postflight privilege checks, and a commented rollback grant restoring the observed anon/authenticated table-level ACL.

## Conditions before STAGING WRITE

1. Establish the canonical STAGING table source and dependency graph; table is currently absent.
2. Confirm runtime DATABASE_URL role on Preview without revealing credentials; verify server functions connect through the expected server-only role.
3. Audit views, RPCs, triggers, schema grants, column grants, role inheritance, default privileges, service_role callers, and PostgREST access.
4. Build isolated synthetic test fixtures and identities; no real title/customer/payment data.
5. After separate STAGING WRITE approval only, apply the narrow ACL change to a valid STAGING table and run anonymous, unrelated authenticated, owner/requester, studio-member, internal-admin, and service-role tests.
6. Confirm internal delivery-jobs list/create/assign/complete/approve paths work and direct PostgREST access is denied.
7. Production correction requires a separate explicit WRITE approval; this document grants none.

## Current release posture

PRODUCTION HOLD / NOT CERTIFIED / NO-GO. No Production or STAGING writes, no migration, no rollback, no deployment, no merge, no Razorpay live payment, no Hostinger activation or mail.

App-inu pani kittaruthu.