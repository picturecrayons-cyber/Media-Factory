# Explicit Studio Context — Code-only implementation gate

**Status:** Draft helper + unit tests; runtime wiring NOT APPROVED / NOT VERIFIED  
**STAGING DB:** READ-ONLY only; no database changes  
**PRODUCTION DB:** NO ACTION — HOLD / NOT CERTIFIED / NO-GO  
**Merge / deployment:** None

## Implemented on this Draft branch

- Added `organization-context.ts` with `resolveStudioOrganizationContext(userId, requestedOrganizationId, freshlyLoadedMemberships)`.
- It returns a context only when the requested organization belongs to the exact Bridge user and both membership and organization are active.
- Added `isStudioOrganizationContextCurrent` to revalidate a previously selected context against freshly loaded membership rows.
- Added unit tests for explicit Studio A / Studio B selection, missing/blank selection, foreign user, unknown organization, invited/suspended/removed membership, inactive organization, and context invalidation after suspension/removal/closure.
- Added the new test file to the existing `npm test` script.
- Existing DIT exact user + production + title + asset assignment tests remain in the suite.
- Existing RBAC role matrix continues to cover Creator, Studio, Buyer, Investor, Admin, QC, Legal, Finance and viewer/super-admin separation.

## Critical safety decision

The helper is deliberately NOT wired into `session.ts` or existing `rbac.ts` yet. The current session API does not accept or establish a trusted selected organization context. Changing RBAC first would deny legitimate Studio collaboration across the application and risk regression. Trusting a client-supplied organization ID without a server-side request guard would instead risk cross-Studio access.

Therefore:
- No current runtime behavior has been silently changed.
- Multi-Studio shared-title access remains a known BLOCKED gate until request context is carried through authenticated server operations and revalidated on each operation.
- Do not use the client profile/session's cached organization IDs as authorization proof.
- Do not set a default to the first membership for multi-Studio users.

## Required next implementation before enabling the guard

1. Identify every sensitive Studio server function and its current call contract.
2. Introduce a server-validated organization-context resolver at the authenticated server boundary; obtain the requested organization context from an explicit route/action parameter, but validate it against fresh DB membership rows on every sensitive operation.
3. Ensure queries and mutations use only that validated selected organization ID.
4. Add end-to-end tests proving Studio A cannot read/mutate/download Studio B resources, including signed URL issuance.
5. Add actual approval workflow tests proving only an authorized owner/admin of the same organization can approve membership; invited users cannot self-activate; suspended/removed membership immediately denies.
6. Keep DIT assignment independent of generic roles and require exact active user + production + title + asset scope.
7. Run full CI against the exact HEAD and review all changed files before considering any further gate.

## Status

- Explicit selection helper + unit tests: source committed; CI execution pending.
- Runtime request integration: BLOCKED / NOT IMPLEMENTED.
- Membership approval/revocation workflow: NOT VERIFIED; helper tests cover active-status invalidation only, not persisted approval actions.
- DIT test coverage: source exists; CI execution pending.
- RLS proposal: DEFERRED until runtime context and migration parity gates pass.
- Database: no writes, migrations, policies, grants, or data changes.
- Production: unchanged; HOLD / NOT CERTIFIED / NO-GO.
