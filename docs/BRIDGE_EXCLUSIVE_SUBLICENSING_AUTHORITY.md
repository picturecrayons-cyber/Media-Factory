# Bridge-exclusive sublicensing authority

**Status:** Isolated implementation proposal.  
**Authority owner:** Crayons Bridge.  
**Destination:** Crayons Loop.

## Rule

- Crayons Bridge alone may grant, scope, approve, extend, suspend and revoke sublicensing permissions.
- Creator and Studio may submit title rights evidence and accept a distribution mandate. Their account mandate cannot grant onward-sublicensing authority.
- Crayons Loop is a downstream consumer destination. It may consume the exact approved publication package and enforce consumer playback entitlements. It cannot create, amend, approve, extend or revoke rights grants or sublicenses.
- A Loop publication is not itself a sublicense and does not grant onward-distribution rights.

## Legal boundary

Bridge Super Admin authority is an application control-plane boundary, not a power to invent rights. Bridge may issue a sublicense only where the underlying title-specific agreement expressly grants Bridge the right to sublicense, and only within its scope. Missing, ambiguous, expired, revoked or out-of-scope evidence must fail closed.

## Enforcement requirements

- Creator/Studio mandate schema stores `sublicensingAllowed: false`.
- Creator/Studio clients cannot elevate this flag; server validation is authoritative.
- Any title-level onward-rights evidence is treated as documentary evidence, not as a permission toggle.
- A Bridge-only decision must bind the authenticated verified Super Admin actor, exact title, exact active grant, downstream licensee, territories, languages, media, term, restrictions and source evidence.
- No caller-supplied actor ID, UI state, Loop metadata or publication status can elevate authority.
- Loop APIs and database grants must prevent Loop consumer/backend roles from creating or modifying Bridge rights grants and sublicense records.
- All grant, scope change, extension, suspension and revocation decisions require immutable audit and version history.
- Loop receives only a scoped consumer package; no sublicense capability or rights-editor controls.

## Acceptance tests

- Creator and Studio cannot persist effective sublicensing permission.
- Buyer/Loop cannot create or modify grants or downstream sublicense scope.
- Non-Super-Admin actors are rejected by the Bridge sublicense command.
- Even Super Admin is rejected if the active title-specific grant does not expressly permit sublicensing.
- Wrong title/grant, revoked/expired grant, scope overreach and missing evidence all fail closed.
- Production title, rights, publication, payment, entitlement and asset data remain unchanged during this code-only change.
