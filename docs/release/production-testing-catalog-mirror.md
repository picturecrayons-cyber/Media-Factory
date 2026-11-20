# Production → Testing Catalog Mirror (Bridge + Loop)

## Status

Implementation stage 1: read-only preflight. No catalog rows or object files are copied by this stage. Production remains read-only.

## Approved boundary

- Direction is strictly Production → Testing.
- Bridge title metadata and Loop catalog metadata are in scope.
- Poster artwork is in scope only after an object is copied into Testing storage and its bytes are verified.
- Production identities are never copied. Bridge mirror records must be owned by an existing synthetic Testing Studio profile.
- Testing edits must never propagate back to Production.

## Explicit exclusions

Never mirror master files, screeners, subtitles, censor certificates, rights/legal documents, payments, entitlements, webhook events, user accounts, profiles, authentication records, viewing history, or private delivery data. Do not copy Production storage credentials or Production object URLs into client-visible records.

## Known schema differences (verified 2026-11-20)

| Table | Production columns | Testing columns | Required handling |
|---|---:|---:|---|
| bridge_titles | 34 | 29 | Explicit field mapping; never SELECT * |
| bridge_assets | 18 | 25 | Only approved poster kinds; remap owner and storage keys |
| loop_titles | 25 | 20 | Explicit field mapping between poster_path/poster_url and publication flags |

Production Bridge uses poster_key; Testing Bridge retains poster_key but has a different schema. Loop fields differ: Production has poster_path, backdrop_path, trailer_path, playback_path, listed and published; Testing uses poster_url, backdrop_url, trailer_url, is_listed and is_published. Do not mirror playback_path.

## Stage 1 — read-only preflight

Run `node scripts/catalog-sync-preflight.mjs` with:
- `CATALOG_SYNC_MODE=preflight`
- `CATALOG_SYNC_SOURCE_DATABASE_URL` — read-only connection to project `mlmgugivsyoxzdgwkbpu`
- `CATALOG_SYNC_TEST_DATABASE_URL` — write-capable or read-only connection to project `jbymleftneggcgutlcqu` (this stage only reads)
- `CATALOG_SYNC_TEST_OWNER_USER_ID` — an existing Testing `studio` profile ID, never a Production user ID

The script checks both project refs, confirms the mapped Testing Studio profile exists, rejects an owner ID that is already used by a Production title, compares schemas and reports catalog/poster counts. It performs SELECT statements only and has no write mode.

## Stage 2 — implementation gates

Before enabling any data writes:
1. Approve a field-by-field mapping against the live schema, including NOT NULL/default and FK requirements.
2. Confirm the synthetic Testing Studio owner and title-ID strategy.
3. Implement idempotent Testing-only upserts with a source fingerprint and an audit record; preserve any Testing-only fields.
4. Copy only poster objects from Production OCI to the Testing bucket using separate source-read and target-write credentials; verify SHA-256 and content type before updating Testing paths.
5. Ensure the workflow is manual, environment-protected, dry-run by default, and rejects any target other than the Testing project.
6. Verify counts, poster object checksums and application display in Testing. Never deploy this job to Production.

## Current blocker

A successful preflight does not authorize or perform the sync. Poster transfer needs separately provisioned source-read and Testing-write OCI credentials in a protected CI environment. No secret values belong in source control or chat.
