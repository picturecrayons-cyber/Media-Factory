# Bridge-to-Loop OTT Device Delivery Contract

Status: integration contract foundation only — no database or runtime behavior changed.

## Authority boundary

Crayons Bridge is the source of truth for QC, legal clearance, rights grants, territory, language, exploitation model, distribution window, and publication authorization. Crayons Loop is the consumer delivery and playback surface.

Bridge authorizes → Loop delivers.

## Existing code baseline reviewed

- `src/lib/bridge/loop-publication.ts` contains `authorizeLoopPublication`, `suspendLoopPublication`, `revokeLoopPublication`, and `getLoopPublication`.
- Authorization currently calls `verifyDistributionPreflight`, checks the operator permission, synchronizes a Loop title, records `bridge_loop_publications`, and writes an audit event in a transaction.
- The current publication contract test exercises authorization status alignment and negative cases for missing/revoked/territory-mismatched rights and denied permission.
- These code paths were reviewed read-only for this foundation. They were not changed or executed against a database.

## Required delivery invariants

1. A title is eligible for Loop only after Bridge preflight confirms the required QC, legal, rights, destination, territory, language, exploitation model, and window.
2. Loop catalogue visibility is downstream state; it must never independently grant playback access.
3. Playback access must check the active Bridge publication and rights window at session creation and at the required revalidation points.
4. Suspend/revoke in Bridge must fail closed for new playback sessions. Existing sessions must follow the defined revocation policy and short-lived token/session expiry.
5. Loop clients must receive only approved rendition/session references, not Bridge master object keys or unrestricted origin URLs.
6. Device-specific players (web, Android, Android TV, iOS, iPadOS, tvOS) consume the same authorization contract; platform code must not create a second rights authority.
7. Every authorization, suspension, revocation, and playback-session decision must remain auditable.

## Integration phases

- Phase 0: document and preserve the authority contract (this change).
- Phase 1: read-only trace of Bridge publication preflight → Loop catalogue sync → playback-session API; identify any bypass or mismatch.
- Phase 2: add contract tests for device-independent playback-session authorization, expiry, territory, revocation, and master-URL non-disclosure.
- Phase 3: integrate Loop web/native clients with the playback-session contract.
- Phase 4: staging-only end-to-end verification; no production writes or publication without separate approval.

## Explicit safety boundary

- No STAGING DB or PRODUCTION DB query/write/migration was performed by this documentation change.
- STAGING DB: future integration verification only after an explicitly scoped gate; WRITE not authorized here.
- PRODUCTION DB: HOLD / NOT CERTIFIED / NO-GO; no access or writes authorized.
- No title is published, no rights grant is created, no payment is initiated, and no customer notification is sent.
- No Vercel project settings, environment variables, domains, aliases, or production deployments are changed.

## Evidence labels

- PASS: only when a specific test or inspection demonstrates the invariant.
- FAIL: a verified invariant violation.
- BLOCKED: required dependency or permission is unavailable.
- NOT VERIFIED: no adequate evidence yet.

Preserve the no-regression rule: App-inu pani kittaruthu.
