# Loop OCI media provider — Preview-only implementation proposal

**Status:** proposal for isolated Preview implementation; not a Production change  
**Owner boundary:** Crayons Bridge authorizes; Crayons Loop delivers  
**Release posture:** Production HOLD / NOT CERTIFIED / NO-GO

## 1. Objective

Replace Loop's current AWS S3 URL-signing dependency with a private Oracle Cloud Infrastructure (OCI) Object Storage provider, while retaining the Bridge publication grant as the authority for every title, territory, language, platform, exploitation model and release window.

This document is an implementation proposal. It does not switch providers, create buckets, move objects, modify databases, or configure credentials.

## 2. Non-negotiable safety rules

- Implement and test only on a dedicated Loop STAGING database and isolated Preview deployment.
- Use a dedicated non-production OCI tenancy identity or least-privilege user and a dedicated private Preview bucket. Do not reuse Bridge Production credentials, bucket or namespace configuration.
- Prefix Loop-only variables with `LOOP_OCI_`; configure them for Preview only. Never expose private keys to browser bundles or logs.
- No silent AWS fallback. If OCI is unavailable or misconfigured, fail closed and do not issue a media URL.
- Do not change Bridge Production, Loop Production, Production Vercel variables, Production buckets, DNS, main branch, or production aliases.
- Do not perform real payment, production mail, or Production storage tests.
- Keep AWS source objects and existing configuration untouched until a separately approved migration and rollback plan is certified.

## 3. Proposed provider boundary

Introduce a server-only Loop media provider interface:

- `createPlaybackAccess(titleId, assetKey, viewerContext)`
- `createArtworkAccess(titleId, assetKey, viewerContext)`
- `headObject(assetKey)`
- `verifyObject(assetKey, expectedSize, expectedChecksum)`

The OCI implementation should use the supported OCI Object Storage SDK and private buckets. Prefer a short-lived, read-only Pre-Authenticated Request (PAR) or a server-side streaming proxy with bounded TTL, scope and object permissions. Do not generate public object URLs.

The AWS implementation may remain as a separately selected legacy/test adapter during the migration window, but provider selection must be explicit per environment and must never fall back silently.

## 4. Authorization order (fail closed)

1. Authenticate the viewer and resolve the viewer's trusted country on the server.
2. Resolve the canonical Loop title and its Bridge publication authorization.
3. Verify the publication is active and not suspended/revoked.
4. Verify the viewer's country is within the authorized territories (WORLDWIDE only when explicitly granted).
5. Verify language, platform, exploitation model and release start/end boundaries. Missing required boundaries deny access.
6. Verify the required TVOD/subscription entitlement and its expiry/revocation state.
7. Only after all checks pass, resolve the private OCI object key and create a short-lived read-only access grant.
8. Audit the authorization decision without logging signed URLs, tokens, private keys or personal data.

Artwork/poster/trailer signing must follow the same publication and territory checks. Remove query-string bearer-token fallback; use the authenticated session header/cookie contract.

## 5. Preview configuration contract

Use separate Preview-only settings, for example:

- `LOOP_OCI_REGION`
- `LOOP_OCI_NAMESPACE`
- `LOOP_OCI_BUCKET`
- `LOOP_OCI_TENANCY_OCID`
- `LOOP_OCI_USER_OCID`
- `LOOP_OCI_FINGERPRINT`
- `LOOP_OCI_PRIVATE_KEY`
- `LOOP_OCI_PRIVATE_KEY_PASSPHRASE` (only if the key is encrypted)

Do not configure these until the dedicated Preview identity and bucket exist. Never place the values in Git, issue comments, build output or client-visible `VITE_` variables.

## 6. Object migration and verification

For synthetic Preview assets only:

- Upload to a separate Preview bucket/prefix.
- Record object key, title mapping, content type, byte size and SHA-256 checksum.
- Read back object metadata and verify byte count/checksum.
- Verify PAR expiry, read-only behavior, denied write/delete, and no public bucket access.
- Test range requests and playback compatibility.
- Keep a machine-readable migration manifest and rollback mapping.
- Do not copy or move Production masters in this phase.

## 7. Required prerequisites before E2E

- Dedicated Loop STAGING Supabase project/database, independently verified and separate from Bridge Testing and both Production databases.
- Reviewed additive Loop schema/migration and rollback plan; no blind replay of legacy SQL.
- Dedicated Preview OCI identity, private bucket and least-privilege policy.
- Dedicated test SMTP sink/mailbox; no Preview-to-Production SMTP route.
- Exact Preview deployment SHA, Supabase project reference, database session role and OCI identity/bucket verified.
- Security tests for unauthorized title, revoked grant, wrong territory, expired window, missing boundary, missing entitlement and replay.

## 8. Acceptance gates

| Gate | PASS evidence |
|---|---|
| Provider isolation | Preview uses only the dedicated Loop OCI identity and private Preview bucket |
| No fallback | OCI failure returns a controlled denial; no AWS URL is issued |
| Authorization | Bridge grant and every territory/window/entitlement check precede URL creation |
| Object integrity | SHA-256, size and content type match the Preview manifest |
| URL safety | Short TTL, read-only scope, no token/URL in logs |
| Playback | Authenticated playback and range requests pass with synthetic Preview media |
| Regression | AWS legacy compatibility is not accidentally used by Preview or Production |
| Production boundary | No Production configuration, data, objects or deployment changed |

Any BLOCKED or NOT VERIFIED item keeps Production at HOLD / NOT CERTIFIED / NO-GO.

## 9. Current blockers

- Dedicated Loop STAGING backend has not been established.
- Loop Preview currently references Bridge Testing configuration.
- Loop playback source still uses AWS S3 signing.
- Preview OCI identity/bucket isolation is not proven.
- Loop Preview SMTP variables may route to Production mail.
- Current Bridge Testing DB is not a complete Loop runtime schema.

**Decision:** implement the provider only after the prerequisites in Section 7 are independently verified. This proposal is not authorization for Production cutover.
