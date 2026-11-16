# Bridge → Loop HLS packaging worker

## Purpose

`scripts/package-loop-hls.mjs` is a one-title, OCI-backed packaging worker. It downloads the QC master from Bridge OCI, creates a VOD HLS playlist and MPEG-TS segments with FFmpeg, uploads each object to OCI, re-reads each object to verify SHA-256 and byte length, then emits a JSON evidence document.

The worker does **not** write `bridge_playback_renditions`, authorize rights, publish a title, or modify either database. A separate reviewed registration operation is required after migration 0013 has been reconciled and applied to an approved STAGING DB.

## Required runtime

- Node.js with `--experimental-strip-types`
- FFmpeg with `libx264` and AAC encoders
- Network access to the configured OCI Object Storage region
- A dedicated, least-privilege OCI principal permitted to read the selected master and create/read rendition objects in the configured bucket

## Required environment

```sh
BRIDGE_TITLE_ID=<Bridge title id>
BRIDGE_MASTER_KEY=<relative OCI object key for QC master>
BRIDGE_RENDITION_PREFIX=bridge-renditions/<Bridge title id>/<unique-run-id>
OCI_TENANCY_OCID=<secret>
OCI_USER_OCID=<secret>
OCI_FINGERPRINT=<secret>
OCI_PRIVATE_KEY=<PEM secret>
OCI_REGION=<OCI region>
OCI_NAMESPACE=<OCI namespace>
OCI_BUCKET_NAME=<OCI bucket>
```

Never place credentials in command-line arguments, repository files, generated evidence, or logs. Use the worker's isolated secret store. Do not copy Production credentials into Preview or Testing.

## Execute

```sh
node --experimental-strip-types scripts/package-loop-hls.mjs > rendition-evidence.json
```

The worker requires `BRIDGE_RENDITION_PREFIX` to begin with `bridge-renditions/<titleId>/`, rejects URL/traversal object keys, refuses to overwrite the source master, and only accepts the expected playlist/segment output names.

## Evidence and release gate

The output includes the HLS manifest key, SHA-256 and byte length for every uploaded object, and `registryWritePerformed: false`. Review the evidence, then use a separately approved server-side operation to insert a primary HLS rendition row with status `VERIFIED`, checksum and verification timestamp.

Before a rendition may be used:
1. Confirm migration 0013 is compatible with the target STAGING schema and RLS/grants.
2. Independently inspect the manifest and every referenced segment.
3. Verify every OCI object checksum and content type.
4. Register the manifest in Bridge through a reviewed server-only path.
5. Confirm Loop uses an OCI delivery adapter. The legacy Loop endpoint signs AWS S3 URLs and now deliberately rejects Bridge OCI HLS records until that adapter exists.

## Safety

- No database connection or SQL writes in this worker.
- No title publication, rights grant, payment, email, or customer action.
- No Production deployment.
- Run only against an explicitly selected test master and isolated output prefix until all gates are separately approved.
