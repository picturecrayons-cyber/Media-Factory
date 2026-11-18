# Bridge-exclusive sublicensing authority

**Status:** Server-side implementation in isolated Draft PR #725; not released.  
**Authority owner:** Crayons Bridge.  
**Destination:** Crayons Loop.

## Rule

- Crayons Bridge alone may grant, scope, approve, extend, suspend and revoke sublicensing permissions.
- Creator and Studio may submit title rights evidence and accept a distribution mandate. Their account mandate cannot grant onward-sublicensing authority.
- Crayons Loop is a downstream consumer destination. It may consume the exact approved publication package and enforce consumer playback entitlements. It cannot create, amend, approve, extend or revoke rights grants or sublicenses.
- A Loop publication is not itself a sublicense and does not grant onward-distribution rights.

## Implemented in this PR

- Creator/Studio distribution mandates have `sublicensingAllowed: false`.
- Title submission rejects any attempt to enable sublicensing as part of the submission process. Submission is not a sublicensing decision.
- The separate `authorizeBridgeSublicense` server command requires an authenticated, verified Bridge Super Admin.
- The command binds the exact title and VALID rights grant, requires independent Legal approval for that grant, requires a verified title-linked distribution/finished-film agreement, and constrains territory, language, media and term to the underlying grant.
- Each downstream authorization is stored in `bridge_sublicense_authorizations` with licensee, scope, term, restrictions, evidence reference and actor.
- `revokeBridgeSublicense` is also Bridge Super Admin-only and writes an audit event.
- The new table has RLS enabled and denies direct anon/authenticated table access; the server uses the trusted database connection.

## Legal boundary and remaining verification

Bridge Super Admin authority is an application control-plane boundary, not a power to invent rights. The Super Admin must affirm that the linked signed agreement expressly permits onward sublicensing. The application verifies that the evidence is title-linked and marked VERIFIED; it does not independently interpret contract language.

Before merge/release, verify:
- Exact-head CI, typecheck, lint and migration replay.
- Database role behavior in an isolated Preview environment.
- Independent security review of all Bridge and Loop server/database access paths.
- Role-based E2E proving Creator, Studio, Buyer, ordinary Admin and Loop consumer identities cannot create or mutate sublicense records.
- Idempotent retry behavior and the full amendment/extension/suspension/revocation lifecycle.

No Production DB, title, grant, publication, payment, entitlement, customer media, secret or deployment was changed by this PR.
