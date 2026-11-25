# Bridge OCI storage cost optimization — Testing-first plan

## Objective

Reduce avoidable OCI Object Storage cost without introducing a new provider, paid service, or Production risk. This is a cost-control plan, not a claim that OCI storage or delivery is free.

Canonical provider remains Oracle OCI Object Storage in Mumbai. The existing bucket `bucket-20260526-1544` is the approved bucket; do not create another bucket for this work.

## Non-negotiable safety rules

- No Production object moves, tier transitions, overwrites, or deletes as part of this change.
- No changes to title publication, QC, Rights, Legal, delivery, or TVOD entitlement state.
- Preserve title/asset IDs, object keys, object versions, SHA-256, byte size, ownership, retention, legal hold, and audit history.
- Never infer object existence or verification from a database row alone.
- Never treat an OCI ETag as a SHA-256 digest.
- No public object URLs or long-lived PARs. Playback continues through the authenticated Bridge media proxy.
- Keep soft-archive/audit semantics; no permanent deletion.

## Tier policy

| Workload | Tier recommendation | Guard |
|---|---|---|
| Active Loop master, trailer, poster, subtitle and delivery package | STANDARD | Must remain immediately readable for playback/delivery |
| Infrequently accessed, non-critical source/working assets | INFREQUENT, only if supported by the actual OCI bucket/region configuration | Require measured access history and a cost comparison including retrieval/egress |
| Preservation master or legally retained original | STANDARD or approved ARCHIVE policy | ARCHIVE only after explicit restoration SLA, retention/legal review, and successful restore test |
| Temporary failed/incomplete upload | Candidate for cleanup review | No automatic deletion; verify ownership, age, references, retention and audit trail |

Do not confuse physical OCI storage tier with Loop access tier (FREE/SVOD/TVOD).

## Cost measurement before any move

Collect, without exposing secrets:
- OCI bucket and namespace, region, object count and total bytes by prefix.
- Object count/bytes by storage tier and age cohort.
- OCI request, retrieval, lifecycle and outbound transfer charges from the billing/usage view.
- Playback and delivery access history, where available.
- Duplicate candidates by content hash, while preserving independent title/rights references.

Compare monthly storage savings against retrieval, request, lifecycle and egress costs. If the expected net saving is not positive, do not transition the object.

## Testing-only execution sequence

1. Confirm a dedicated OCI principal/API key whose IAM policy is restricted to the Testing prefixes `bridge-testing/` and `bridge-testing-recovery/` in the existing bucket.
2. Confirm the exact OCI tier names and availability for the bucket's Mumbai region/account; do not assume that application labels map directly to OCI tier names.
3. Generate a read-only inventory and proposed transition report. No automatic transition.
4. Use a non-production test object to exercise copy/verification/restore in Testing. Verify byte length and SHA-256 after every copy or restore.
5. Test authorized media proxy reads and HTTP byte ranges after restoration.
6. Record cost estimate, actual OCI usage evidence, object version, checksum and audit entry.
7. Only after review, enable a narrowly scoped Testing policy. Production remains out of scope and requires a separate approval.

## Jananam 1947 and Pranayam 1947

These are real certification candidates, not permission to publish or alter their Production state. Keep Production objects and mappings unchanged. Use a properly authorized Testing copy under the Testing prefixes and preserve provenance back to the source asset. Do not duplicate or move media until the restricted Testing principal and cost/transfer implications are verified.

## Rollback

- Keep original object and pointer until destination verification and playback checks pass.
- Update a Testing pointer only after object version, byte size and SHA-256 match.
- On any mismatch, restore the original Testing pointer and retain both objects for investigation.
- Do not delete source objects as part of rollback.
- Production rollback is not part of this change.

## Acceptance criteria

- No Production configuration, database row, publication status, or OCI object changed.
- Testing-only credentials cannot read or write outside the two approved Testing prefixes.
- A dry-run inventory and net-cost comparison are available.
- A test copy/restore has matching SHA-256 and byte size.
- Authorized playback and byte-range tests pass through Bridge proxy.
- Entitlement-denied requests remain denied.
- The measured expected monthly net saving is positive before any tier transition is enabled.

## Current implementation scope

This PR adds the operating plan only. It intentionally does not add a database migration, alter storage tiers, move objects, change OCI IAM, or modify Vercel environment variables. Those operations require measured inventory, restricted OCI credentials, and a separate verified execution.
