# Censor Certificate Versioning — Preview Plan

## Intended behavior

- A dedicated Censor Certificate section in Title Workspace lists verified uploads with original filename, upload date, content type, size, and status.
- Only authorized title owners/studio collaborators and permitted internal staff can preview a certificate via a short-lived signed URL. Buyer role must never receive a certificate URL or object key.
- Server-side SHA-256 over the stored object is the source of truth for exact-content duplicate detection. Client-provided digests are hints only.
- An exact duplicate should be blocked or require an explicit replace/cancel decision. Same-name/different-hash is a warning, not a duplicate verdict.
- Replacement creates a new asset row and links the prior row as superseded; history is append-only and old rows/objects are retained.
- Audit events capture signed upload, verification, duplicate detection, preview access, replacement, and supersession without storing signed URLs or secrets.

## Blocking checks

1. The supplied Preview alias previously returned the Production Supabase project ref `mlmgugivsyoxzdgwkbpu`; do not upload test files or run migrations against that deployment.
2. The existing Production `bridge_assets_kind_chk` includes `trailer`, `subtitle_extra`, `audio`, `audio_dub`, `audio_description`, `censor_certificate`, and `technical`. The old migration `20261004_bridge_assets_add_censor_certificate.sql` would drop/recreate this check with fewer allowed values. Do not apply or copy that migration to any environment without a corrected additive constraint migration.
3. The existing `bridge_asset_versions` table must be inspected and reused where its contract fits before introducing another version mechanism.
4. A clean isolated Preview database must be active and verified before migration/testing; a branch currently reporting `MIGRATIONS_FAILED` does not qualify.
5. Only after code review and passing Preview tests may production release be considered. This plan does not authorize a Production deployment or Production migration.

## Acceptance tests

- Creator/studio owner can upload and preview their own verified certificate.
- Unrelated creator cannot list, preview, download, replace, or infer metadata of another creator's certificate.
- Buyer receives no certificate row, key, signed URL, or history.
- Internal staff access follows explicit existing RBAC permissions; do not grant upload capability to admin roles by accident.
- Exact SHA-256 duplicate is caught even if the filename changes.
- Same filename with different bytes warns without mislabelling content as identical.
- Replacing a certificate retains the prior row and emits an audit event; history is newest-first and clearly identifies current/superseded.
- PDF and image previews are authenticated, time-limited, and do not expose permanent object URLs.
- Invalid MIME/type, empty object, mismatched size and failed hash verification do not mark an asset verified.
- Migration retains every existing allowed asset kind and is idempotent where possible.
