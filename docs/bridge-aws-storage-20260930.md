# Legacy AWS storage adapter — Bridge

**RETIRED FOR PRODUCTION MEDIA.**

Crayons Bridge production media storage is **Oracle OCI Object Storage (Mumbai)**.

This document is retained only to explain legacy compatibility/test code. AWS/S3 configuration must never be reported as Bridge production storage readiness.

Canonical production storage variables:

- `OCI_TENANCY_OCID`
- `OCI_USER_OCID`
- `OCI_FINGERPRINT`
- `OCI_PRIVATE_KEY`
- `OCI_REGION`
- `OCI_NAMESPACE`
- `OCI_BUCKET_NAME`

Use `src/lib/bridge/oci-object-storage.server.ts` for the production media path.
