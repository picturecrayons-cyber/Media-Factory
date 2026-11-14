# OCI IAM + Primary/Recovery verification — READ-ONLY gate and test plan

Date: 2026-11-14
Repository: `picturecrayons-cyber/Media-Factory`
Production source reference: `16d370ebe455045255868c556604a874cd1910af`
Working branch: `security/bridge-delivery-jobs-client-grants-review`
Document status: proposal / evidence checklist only. Not executable.

## 1. Change-control boundary

| Target | Action | Access | Risk |
|---|---|---|---|
| OCI Identity & Security | Inspect Default domain, users/groups (redacted), policy statements and compartment scope | READ-ONLY | Low |
| OCI Object Storage | Inspect Primary/Recovery bucket metadata and object metadata only | READ-ONLY | Low |
| GitHub | Inspect source and add this documentation | READ + documentation WRITE on this branch | Low |
| Supabase PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | No action | NONE | No change |
| Supabase STAGING DB `jbymleftneggcgutlcqu` | No action | NONE | No change |
| Vercel `bridge` | No deployment, environment inventory, secret read or edit | NONE | No change |
| Hostinger Mail | Search/read existing evidence only; no dispatch | READ-ONLY | Low |

No OCI policy/bucket/object writes, no object upload/copy/delete, no IAM edits, no Vercel environment changes, no Supabase SQL, no GitHub merge/deployment, and no email dispatch are authorized by this gate. Budget: ₹0.

## 2. OCI account connection and evidence status

- OCI Console URL was supplied, but a URL does not establish an authenticated OCI API/console session.
- No dedicated OCI connector/action was available in the connected tools during this gate.
- Therefore OCI tenancy identity, IAM principal, group membership, policy scope, bucket ownership, Primary object GET, Recovery object GET, and backup status are **NOT VERIFIED**.
- User-provided screenshots are still required for console-side READ-ONLY inspection. Redact email addresses, OCIDs not needed for the review, tokens, keys, and other secrets. Never share a private key, API signing key, password, MFA code, or token.

Required screenshot/evidence set:
1. Identity Domains → Default → Overview (domain state/type and home region only).
2. Default domain → Users and Groups list, with personal identifiers redacted; enough to distinguish the intended OCI user/group names.
3. Identity & Security → Policies → `bridge-storage-copy-policy`: complete statement text, policy attachment compartment, and policy scope.
4. Object Storage → Primary bucket `bucket-20260526-1544`: exact region, namespace, compartment, and bucket details.
5. Object Storage → Recovery bucket: exact bucket name, region, namespace, compartment, and bucket details. Do not infer or invent a Recovery bucket name.
6. For each existing test/evidence object, show object name, bucket, size, ETag and last-modified metadata. Do not download or mutate objects in this gate.

A policy screenshot alone is not enough: it must be reconciled with the actual user/group/dynamic-group principal and the bucket compartment. A historical email checklist is not current OCI policy evidence.

## 3. Historical mailbox evidence — not current-state proof

Hostinger Mail read-only search found:
- 17 October 2026 email titled `P0: OCI Bridge Storage Setup — Exact Missing Prerequisites`.
- It recorded Primary bucket `bucket-20260526-1544`, region `ap-mumbai-1`, and at that time reported incomplete Preview OCI authentication configuration and a reported `InsufficientServicePermissions` error.
- It described a proposed compartment-scoped Object Storage policy and a future harmless Preview test.

This email is historical setup guidance only. It does not establish the current policy, current principal, current Vercel variable state, actual bucket configuration, or a successful object copy/readback. Exact mailbox search for `bridge-storage-copy-policy` returned no matching message. No email was sent or modified.

## 4. GitHub code review — verified at Production main SHA

### OCI environment configuration
File: `src/lib/bridge/env.ts` (blob `c9d356e4d81fe25f4da748af4724a5c47cab3716`)

- Reads `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY`, `OCI_REGION`, `OCI_NAMESPACE`, `OCI_BUCKET_NAME`, and `OCI_RECOVERY_BUCKET_NAME`.
- Recovery readiness is represented separately and requires both Primary and Recovery bucket names to be present and distinct.
- This is source-code configuration logic only; it does not prove any Vercel environment has the values configured.

### Release readiness gap
File: `scripts/release-readiness.mjs` (blob `d0725f4c3af787ce60b473ffcfc34d181bd9d716`)

- The generic OCI required-variable list includes tenancy OCID, user OCID, private key, region, namespace and Primary bucket.
- It does **not** include `OCI_RECOVERY_BUCKET_NAME`.
- Therefore the script's generic OCI readiness result cannot certify Recovery configuration. This is a confirmed code-level coverage gap, not proof that the runtime Recovery feature is absent.
- No code change is proposed in this documentation-only gate.

### Runtime Primary → Recovery flow
File: `src/lib/bridge/dit-agent.ts` (blob `230ba42ae8aff5937c90ee884a72ae5f57cab1ba`)

The inspected server handler:
1. Requires a verified DIT operator and organization-scoped ingest session.
2. Requires distinct Primary and Recovery bucket names.
3. Verifies Primary object size/ETag and streams Primary bytes to compare SHA-256 with the registered manifest.
4. Copies the object to a distinct Recovery key/bucket.
5. Verifies Recovery size/ETag and SHA-256; checks Primary and Recovery hashes match.
6. Writes verification evidence to Supabase only after those checks.

This is code-path evidence only. It does not prove that the live OCI principal has the necessary permissions or that either bucket currently contains a readable object.

### OCI adapter and unit tests
Files:
- `src/lib/bridge/oci-object-storage.server.ts` (blob `f69b87b7647df877536c7351ba72022bd424058a`)
- `src/lib/bridge/oci-object-storage.test.ts` (blob `74a54dec0abe81fe4ce18df2be33cceef932a263`)

Code implements signed requests, copy work-request polling, object metadata verification, and streamed SHA-256/byte-size verification. Unit tests use mocked OCI HTTP responses and synthetic bucket names such as `primary-vault` / `recovery-vault`. They verify code behavior under mocks; they are not live OCI IAM, bucket, or object-readback evidence.

## 5. Least-privilege policy review — proposal checklist, no policy text pre-approved

Once screenshots are provided, review the complete policy statement(s) against:
- Exact OCI service principal / dynamic group / user principal, as applicable.
- Correct region-specific Object Storage service principal for copy operations.
- Exact bucket compartment(s); avoid tenancy-wide scope unless a separately documented requirement proves it necessary.
- Required permissions for the observed copy and readback workflow; distinguish source read/inspect from destination create/overwrite and object read/inspect.
- Whether delete permission is genuinely required. Do not include `OBJECT_DELETE` by default; it requires a separate documented need and approval.
- Whether the policy grants more verbs, compartments, or principals than the DIT flow requires.
- Existing duplicate or inherited policies that may already grant access.

Do not copy/paste or apply a suggested policy statement until the real principal and compartment are evidenced and an OCI administrator separately approves a WRITE change.

## 6. Future Preview-only test plan — NOT AUTHORIZED / NOT RUN

This is a design for a later separately approved test, not an instruction to execute now.

Preconditions:
- OCI Console identity, target user/group/dynamic group, policy statements and compartment scope verified.
- Primary and Recovery bucket names, regions, namespaces and compartments independently verified; buckets must be distinct.
- Preview-only application credentials are independently confirmed without exposing secret values.
- Production OCI credentials are not made available to Preview.
- A separately approved isolated Preview test prefix and disposable synthetic test payload are selected.
- No Production title/master/customer asset is used.

Proposed evidence sequence after explicit OCI WRITE approval:
1. Use a synthetic payload with known byte size and precomputed SHA-256.
2. Upload only under the approved Preview test prefix in the Primary bucket.
3. Read back Primary metadata and bytes using authenticated OCI GET; verify exact size and SHA-256.
4. Copy the test object to the confirmed Recovery bucket and wait for the copy work request to complete.
5. Read back Recovery metadata and bytes using authenticated OCI GET; verify exact size and SHA-256.
6. Compare Primary and Recovery hashes byte-for-byte.
7. Record bucket names, region, object keys, timestamps, ETags, byte size, SHA-256 and work-request result, redacting credentials.
8. Cleanup of the synthetic test object(s) is a separate destructive action and requires explicit approval; do not silently delete test objects.

Acceptance:
- Correct authenticated principal and least-privilege policy scope evidenced.
- Primary and Recovery are distinct, confirmed buckets.
- Both authenticated GET/readbacks succeed.
- Both byte sizes equal the expected size.
- Both SHA-256 values equal the expected digest and each other.
- No Production object, Production credential, or customer data is involved.

Any missing step remains BLOCKED / NOT VERIFIED. A successful mock unit test or generic readiness script is not a substitute for this evidence.

## 7. Gate decision

| Gate | Status |
|---|---|
| OCI connector/authenticated access | NOT CONNECTED / NOT VERIFIED |
| Domain / user / group evidence | AWAITING REDACTED SCREENSHOTS |
| `bridge-storage-copy-policy` statements and scope | NOT VERIFIED |
| Primary bucket metadata | NOT VERIFIED |
| Recovery bucket metadata | NOT VERIFIED |
| OCI code path | PASS — CODE REVIEW ONLY |
| Mocked OCI unit tests | PASS — TEST CODE ONLY |
| Release-readiness Recovery variable coverage | GAP CONFIRMED |
| Live Primary authenticated GET | NOT VERIFIED |
| Live Recovery authenticated GET | NOT VERIFIED |
| Matching live SHA-256 + byte size | NOT VERIFIED |
| Preview/Production OCI isolation | NOT VERIFIED |
| OCI write/test/cleanup | NOT AUTHORIZED |
| Production release | HOLD / NOT CERTIFIED / NO-GO |

**Decision:** remain PRODUCTION HOLD / NOT CERTIFIED / NO-GO. No IAM, bucket, object, Supabase, Vercel, mail, merge, or deployment changes were made.
**App-inu pani kittaruthu.**
