# Bridge AWS storage integration

Bridge owns ingestion, master and artwork assets, QC, rights, delivery and publication. Loop consumes authorized publications. Active Bridge asset and service-order APIs now use the AWS adapter; OCI is retained only as retired code and regression coverage, with no active API imports.

## Configuration

Server-only AWS_REGION and AWS_S3_MEDIA_BUCKET are required. Bucket aliases S3_MEDIA_BUCKET and AWS_S3_BUCKET are accepted. Credentials use the SDK workload-role chain or paired AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY with optional AWS_SESSION_TOKEN. Configuration presence is not a connectivity certification. No credentials are returned to clients.

Uploads and downloads use short-lived S3 presigned URLs. Existing title ownership, verified identity, RBAC, master-download denial and audit gates remain enforced. Confirmation verifies the object, conditionally copies the inspected source ETag to a unique sealed key, verifies destination size and ETag against the copy response, then persists the sealed asset. S3 copy ETags may differ from the source; they are opaque identifiers, not portable file checksums.

Current single-part upload/confirmation is limited to 5 GiB. Larger masters need persisted multipart/resume and multipart sealing before production release. The adapter rejects oversized sealing rather than falsely confirming it. This PR does not implement multipart, a media-processing worker, new C2C transfers, transcoding or new playback entitlements.

## Legacy export mapping (read-only)

| Export | Count | Target meaning |
|---|---:|---|
| films_film | 21 | Legacy title identity, metadata and existing object keys |
| accounts_user | 98 | Legacy contacts and ownership references; not verified Auth identities |
| films_filmbuyermapping | 34 | Buyer relationships; not automatic live entitlements |
| films_status | 8 | Upload-status evidence; not an S3 HEAD check or technical QC |
| films_filmdraft | 139 | Draft metadata; never automatically publish |
| films_payment | 16 | Historical payment evidence; not fresh captured-payment verification |
| films_viewhistory | 15 | Historical viewing evidence |
| films_comment | 0 | No comment records |
| accounts_base_content | 26 | Legacy token-related records; never import into product auth |
| auth_permission | 64 | Legacy permissions; never overwrite current RBAC |

All supplied buyer-mapping film/buyer references and upload-status film references resolve within these exports. Preserve films/... keys exactly, including spaces and punctuation. JSON dumps and personal/payment/token data must remain outside Git.

Jananam (legacy film 7) and Telugu PRANAYAM 1947 (legacy film 36) are separate records with distinct master/poster/trailer keys. Do not coalesce them by similar names. Jananam distribution_territories contains No TVOD / No AVOD and territory restrictions; current rights require owner-reviewed reconciliation before publication. No rights or entitlements were changed.

## Release gate

No database import, AWS object write, credential change, main merge or production promotion was performed for local verification. Tests mock AWS requests. Live S3 object existence, bucket CORS/IAM, authorized upload/download, technical QC, C2C delivery and Bridge-to-Loop playback remain unverified. CRA-102 must remain In Progress until the complete provenance/rendering path is verified against the deployed head.
