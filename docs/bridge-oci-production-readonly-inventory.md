# Bridge OCI Production read-only inventory

## Purpose

Create a bounded, read-only inventory of the confirmed Production bucket `bucket-20260526-1544` in `ap-mumbai-1`. This is the evidence-gathering stage for storage-cost optimization; it does not optimize or change storage.

## Required GitHub environment

Create or verify the protected GitHub Actions environment `bridge-production-storage-readonly` and configure these environment secrets without exposing their values:

- `PRODUCTION_OCI_TENANCY_OCID`
- `PRODUCTION_OCI_USER_OCID`
- `PRODUCTION_OCI_FINGERPRINT`
- `PRODUCTION_OCI_PRIVATE_KEY`
- `PRODUCTION_OCI_NAMESPACE`

The OCI principal should have only the minimum read permissions needed to inspect the namespace and list objects in this bucket. Require reviewer approval on the environment. Do not reuse Testing credentials.

## Run

GitHub Actions → Bridge OCI Production Read-only Inventory → Run workflow.

Type exactly `bucket-20260526-1544`. Default safety cap is 100,000 objects; increase only after confirming the expected inventory scale. The script fails closed if the cap is exceeded, so partial totals are never labeled complete.

## Report limits

The report includes object count, total listed bytes, OCI storage-tier counts, creation-age cohorts, and top-level prefix counts. It does not output object names or media bytes.

Object listing is not a billing statement. The workflow intentionally does not estimate costs or savings. Billed storage, retrieval, request, replication, restore, and egress charges require OCI Usage/Cost reports and appropriate read-only billing permissions.

## Explicit non-actions

- No database connection or writes
- No object GET/download, PUT/upload, copy, rename, tier transition, restore, or delete
- No asset metadata, QC, rights, license, publication, entitlement, or title changes
- No change to Jananam 1947 or Pranayam 1947
- No automatic candidate classification or execution

The title-name match counters are only advisory string matches in object names. They do not prove asset ownership or active playback state. Any later tier-change proposal must reconcile OCI objects to Bridge asset records, legal/commercial holds, retention, last access, recovery posture, and real billing data before separate explicit approval.
