# OCI staging IAM permission checklist

Use this checklist only for a dedicated non-production OCI compartment and bucket. An OCI administrator must verify the exact compartment name, dynamic group membership, resource principal or service principal identity, and source/destination object-copy path before applying any policy. Do not copy these statements to Production.

## Confirm the caller identity first

The error names the Object Storage service principal `objectstorage-ap-mumbai-1`. That may indicate the copy operation is performed by OCI Object Storage on behalf of the request, not directly by the application user. An IAM policy granting `manage objects` to an unrelated dynamic group will not automatically grant permissions to this service principal.

Ask the OCI administrator to identify the documented principal and required source/destination permissions for the exact copy operation. Include customer-managed encryption keys, if used. Prefer bucket-scoped least privilege and avoid broad tenancy-wide `manage all-resources` policies.

## Candidate application-principal policy

Only when the OCI administrator confirms the actual application principal is a dynamic group named `CrayonsBridgeStagingGroup`, and the compartment is confirmed non-production, this is a candidate starting statement for the application principal's own put/get/delete/readback operations:

```text
Allow dynamic-group CrayonsBridgeStagingGroup to manage objects in compartment MediaFactoryStaging where target.bucket.name='crayons-bridge-staging'
```

This statement is not guaranteed to satisfy a server-side object copy executed by the OCI service principal. The administrator should add only the documented service-principal authorization required for the specific copy operation, and only for the specific staging bucket/compartment. Confirm any source-bucket read and destination-bucket write requirements separately.

## Verification

1. Confirm source and destination bucket names, namespace, compartment and region are all staging resources.
2. Verify permissions for the identified caller and the Object Storage service principal, including KMS key access if relevant.
3. Perform a controlled staging-only object copy, read-back verification and cleanup; capture the OCI request/work-request IDs.
4. Inspect the Bridge asset row and audit log. Do not delete a sealed object if persistence outcome is uncertain.
5. Keep the Production Stability Lock active until exact-head CI, Preview, real storage E2E and business-flow checks are separately certified.
