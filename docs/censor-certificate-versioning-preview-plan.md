# Censor Certificate Versioning — Preview Implementation Plan

## Safety
- Preview-only branch; do not merge or promote Production.
- Do not mutate the Production database, title lifecycle, rights, QC, publication, or payment state.
- Do not delete, merge, or overwrite a certificate asset or its audit record.
- Apply the additive SQL migration only after the Preview DB identity and schema have been verified.

## Target UX
A dedicated **Censor Certificate** section in Title Workspace displays original filename, upload date, storage-verification state and a protected preview/download action. A new upload is explicitly labeled **Upload new version** and links to the previous asset through `supersedes_asset_id`; the previous record remains visible in version history.

## Duplicate behavior
- Normalize and compare filenames for a weak same-filename warning only.
- Compare a true SHA-256 digest for an exact-content warning.
- Do not treat OCI ETag as SHA-256; multipart ETags are not cryptographic SHA-256.
- A duplicate is never automatically blocked, merged, or removed. The user chooses cancel or continue as a new version.
- Hashes must be independently verified server-side before being trusted.

## Existing integration requirements
- The `bridge_assets_kind_chk` constraint must allow every supported asset kind, including `technical` and `censor_certificate`. The existing 20261004 migration omits `technical` and must not be replayed without correction and isolated validation.
- Restrict certificate metadata/listing to authorized title readers; never expose signed URLs, object keys or certificate contents to buyers.
- Preview/download uses the existing short-lived signed-download path with role/title checks.
- Audit events must cover duplicate warning, new-version selection and successful verification.

## Tests before Preview release
1. Same SHA-256 produces an exact-duplicate warning.
2. Same filename with a different hash produces a filename warning only.
3. A new version links to the prior asset; the prior row/object remains.
4. Buyers/non-owners cannot inspect certificate metadata or obtain a signed URL.
5. The database constraint includes all supported asset kinds.
6. Certificate preview accepts only PDF/image types and fails closed for unverified assets.
7. Exact candidate SHA has build, typecheck, unit tests, migration checks and authenticated isolated-Preview smoke tests.

## Current blocker
The supplied `bridge-git-fix-deliv-2ffff7` deployment resolves `/api/auth/status` to the Production Supabase project. Do not use it for upload or migration tests until an isolated Preview target is proven.
