# Production → Testing catalog sync

This is a **manual, one-way** catalog mirror for the isolated Testing project.

## Safety model

- Source PostgreSQL must identify as `mlmgugivsyoxzdgwkbpu`; its session is set read-only.
- Destination PostgreSQL must identify as `jbymleftneggcgutlcqu`.
- Destination OCI bucket must be different from the Production bucket.
- Default execution is a dry run. Writes require `--apply`, `BRIDGE_SYNC_TARGET=testing`, and `BRIDGE_SYNC_ALLOW_PRODUCTION_READ=true`.
- Only Bridge title catalog metadata, current poster assets referenced by `bridge_titles.poster_key`, and Loop catalog metadata are mirrored.
- Every mirrored title is reset to `DRAFT`; Loop entries are `DRAFT`, unlisted, unpublished, and free in Testing.
- Owner identity is replaced with the dedicated Testing-only owner ID supplied at runtime. Production owner IDs and organizations are not copied.
- Master keys, playback paths, screeners, subtitles, rights/legal/QC records, pricing, payments, entitlements, accounts, and publication approvals are excluded.
- No reverse sync exists. No Production write path exists.

## Required environment

Set these in a protected operator shell or protected CI environment; never add values to source control:

- `BRIDGE_SYNC_PRODUCTION_DATABASE_URL` — read-only Production connection.
- `BRIDGE_SYNC_TESTING_DATABASE_URL` — Testing DB connection.
- `BRIDGE_SYNC_TARGET=testing`
- `BRIDGE_SYNC_ALLOW_PRODUCTION_READ=true`
- `BRIDGE_SYNC_TESTING_OWNER_USER_ID` — a verified, dedicated Testing-only Studio owner identity; never use a Production user ID.
- Existing OCI signer variables: `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY`, `OCI_REGION`, `OCI_NAMESPACE`, `OCI_BUCKET_NAME`.
- `OCI_TESTING_BUCKET_NAME` — separately provisioned Testing bucket in the same OCI tenancy/region.

## Run

```bash
node --experimental-strip-types scripts/production-to-testing-catalog-sync.mjs
node --experimental-strip-types scripts/production-to-testing-catalog-sync.mjs --apply
```

The first command is read-only dry-run. Run the second only after verifying the dedicated Testing bucket and credentials. The script verifies source poster ETag/size, uses OCI server-side copy into the Testing bucket, and checks destination object size before committing catalog records.

## Current known source coverage

The verified database inspection found 42 Bridge title rows, 181 Bridge asset rows, and 2 Loop title rows. Only current poster assets with an exact `bridge_titles.poster_key = bridge_assets.s3_key` match are eligible for poster copy; other assets are intentionally excluded. Current read-only inspection found four such verified references. The existing Loop `Pranayam 1947` row points at a Bridge title ID whose title is `Koodal`; the sync deliberately drops that mismatched relationship rather than linking the wrong film. Its legacy Loop poster path is not copied until the object can be independently verified.
