# PR #597 migration evidence and STAGING dependency plan

Status: **READ-ONLY EVIDENCE REPORT — NO MIGRATION EXECUTION AUTHORIZED**
Production project: mlmgugivsyoxzdgwkbpu.
STAGING project: jbymleftneggcgutlcqu.
Production posture: **HOLD / NOT CERTIFIED / NO-GO**.

## Migration history readback

- Production migration history: 65 records.
- STAGING migration history: 50 records.
- Production records include:
  - 20261114135434 / bridge_dit_storage_objects_20261114
  - 20261114135437 / bridge_delivery_job_ownership_20261114
  - 20261114135439 / bridge_multilingual_rights_packages_20261114
  - 20261114135443 / bridge_notification_outbox_20261114
- STAGING does not list those four Production migration records. It has a differently named DIT-ingest record 20261114075718 / bridge_dit_ingest_testing_20261114 and site-content record 20261114093221 / bridge_site_content_cms_20261114.

## Source-to-Production mapping

| Capability | Source found on main | Production migration record | Evidence / limitation |
|---|---|---|---|
| DIT ingest base | migrations/0022_bridge_dit_ingest.sql | 20261114074642 / bridge_dit_ingest_20261114 | Source file creates sessions, files, copy verifications; exact migration-runner mapping to recorded version is not yet proven. |
| DIT object evidence | supabase/migrations/20261114160000_bridge_dit_storage_objects.sql | 20261114135434 / bridge_dit_storage_objects_20261114 | Table and FKs exist in Production; filename timestamp differs from recorded version. Exact deployed source hash not established. |
| Delivery requester fields | supabase/migrations/20261114170000_bridge_delivery_job_ownership.sql | 20261114135437 / bridge_delivery_job_ownership_20261114 | requested_by/request_note and index exist; source filename timestamp differs from recorded version. Base table creation source not found in current checked migration paths. |
| Multilingual rights/packages | migrations/0018_multilingual_rights_mvp.sql and supabase/migrations/20261114180000_bridge_multilingual_rights_and_packages.sql | 20261114135439 / bridge_multilingual_rights_packages_20261114 | Production objects exist; exact deployed file/hash and the earlier root migration relationship require reconciliation. |
| Notification outbox | supabase/migrations/20261114190000_bridge_notification_outbox.sql | 20261114135443 / bridge_notification_outbox_20261114 | Production table exists; filename timestamp differs from recorded version. Exact deployed source hash not established. |

**Conclusion:** Production object presence and migration history are verified separately. They do not yet prove that the exact current main-branch file bytes are the bytes applied to Production. Do not reapply these migrations to Production.

## STAGING dependency snapshot

STAGING currently has the DIT parent objects:
- bridge_dit_ingest_sessions
- bridge_dit_ingest_files
- bridge_dit_copy_verifications
- bridge_profiles
- bridge_organizations
- bridge_titles

STAGING currently lacks:
- bridge_dit_storage_objects
- bridge_delivery_jobs
- bridge_notification_outbox

STAGING already has bridge_language_rights, bridge_license_packages, and bridge_package_entitlements.

### Dependency order and blockers

1. **DIT object evidence:** parent prerequisites bridge_dit_ingest_files(session_id, relative_path), bridge_profiles(user_id), and their upstream session/title/organization/profile FKs exist in STAGING. Candidate table can be considered only after comparing all existing constraints, indexes, RLS, grants, and current root migration runner behavior. No DDL applied.
2. **Delivery jobs:** the PR #597 migration is ALTER TABLE + index + comments only. It does not create bridge_delivery_jobs. STAGING lacks that base table. Find and validate the canonical base-table definition and its full dependency graph before considering this migration. Applying it as-is would fail. BLOCKED.
3. **Notification outbox:** source creates a standalone table with no declared FK. Still requires RLS/grant/worker/SMTP path review, idempotency and retry tests before any STAGING write. No mail sent.
4. **Multilingual rights/packages:** the objects already exist in STAGING, but their FKs differ from current source expectations:
   - STAGING bridge_package_entitlements.package_id -> bridge_license_packages(id) ON DELETE CASCADE; current source expects ON DELETE RESTRICT.
   - STAGING bridge_payments.package_id -> bridge_license_packages(id) ON DELETE SET NULL; current source expects ON DELETE RESTRICT.
   - Do not drop/recreate constraints or alter existing rows until the intended deletion semantics are approved and data impact is checked.

## Safe STAGING execution sequence (proposal only)

1. Freeze the exact main commit and migration source file hashes; reconcile migration ledger names/versions with source paths.
2. Locate the canonical bridge_delivery_jobs base-table creation source; compare it with Production columns, constraints, indexes, policies, and grants.
3. Run dependency-only SELECT checks and duplicate/orphan checks for every proposed FK. No DDL or data mutation.
4. Review all application callers, triggers, RPCs, workers, and service-role paths for each target table.
5. Prepare one migration per capability with explicit preconditions, idempotency, rollback limits, and before/after ACL snapshots.
6. Obtain separate explicit STAGING WRITE approval before applying any migration. Test on STAGING only with synthetic identities and records.
7. Capture post-write schema diff, RLS/grants, exact CI, API authorization, and regression evidence. Production remains untouched.

## Non-actions in this report

- No SQL writes, migrations, grants, policies, or row changes.
- No Production deployment, rollback, or promotion.
- No Razorpay live payment, no Hostinger activation, no outbound mail.
- No Vercel deployment retry (Preview daily build limit not cleared).

**App-inu pani kittaruthu.**