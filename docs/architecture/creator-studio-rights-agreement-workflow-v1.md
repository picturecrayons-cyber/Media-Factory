# Creator / Studio Rights & Agreement Approval Workflow
## Phase A — Architecture and Data-Flow Specification

**Status:** DESIGN ONLY — REVIEW REQUIRED  
**Scope:** Creator/Studio online rights proposal, acceptance, Admin synchronization, and downstream legal/QC/license authorization  
**Repository:** `picturecrayons-cyber/Media-Factory`  
**Production posture:** HOLD / NOT CERTIFIED / NO-GO  
**Implementation boundary:** This document adds no application code, database objects, RLS policies, secrets, environment variables, integrations, or deployment configuration.

---

## 1. Purpose and non-goals

### Purpose

Define a secure, auditable workflow in which an authorized Content Owner or Studio representative can review and accept a versioned digital rights/license proposal, with the resulting status synchronized to the internal Bridge Admin workspace.

The workflow must preserve the distinction between:

1. a business proposal created by Admin;
2. the rights holder's informed acceptance;
3. independent legal review;
4. technical QC;
5. internal license authorization;
6. channel-specific publication authorization; and
7. actual public playback availability.

No earlier step implies or automatically grants a later permission.

### Non-goals for Phase A

- No implementation of Creator, Studio, or Admin UI.
- No SQL migration or database write.
- No e-signature provider selection or integration.
- No claim that a checkbox or ordinary click is legally sufficient for every agreement.
- No automatic title lifecycle advancement to `PUBLISHED`.
- No automatic Loop publication or public playback.
- No automatic revenue settlement or payment transfer.
- No change to existing Crayons Loop behavior.
- No production or Preview deployment.

---

## 2. Source-grounded current-state observations

The following observations were checked against the repository's `main` branch at base commit `55e746c131dcc14cca327c9889f88a08aea0a11d`:

- `src/lib/bridge/workflow-policy.ts` defines the current Loop license input: title, one territory, languages, finite start/end timestamps, exclusivity, agreement and ownership references, and owner/distributor shares. The current validator permits `WORLDWIDE` only for Loop and requires the two shares to total 100%.
- `src/lib/bridge/workflow.ts` implements `saveLoopLicense()`. It validates the input, checks the verified actor's title operation permission, inserts a `DRAFT` `bridge_rights_grants` record, stores agreement/ownership references and commercial share fields in its evidence payload, and writes an audit log.
- The current legal review path requires a selected grant and a reviewer different from the grant creator; it records a legal case and changes the grant status. This is an existing internal workflow, not the proposed Owner acceptance workflow.
- `src/components/bridge/workflow-desk.tsx` currently presents a Loop TVOD-specific Business form and an internal legal-review control.
- `publicationIsActive()` requires an authorized/live publication state and a valid start and end time.

These observations are not proof that a particular title's rights, QC, legal status, assets, or publication are currently valid. The proposed workflow must be reconciled against the live schema and complete route/API inventory before implementation.

---

## 3. Actors, identities, and authorization

### 3.1 Actor classes

| Actor | Permitted actions | Explicitly not implied |
|---|---|---|
| Internal Admin / authorized license operator | Create and send a proposal; view workflow status; request a revision | Cannot attest to owner consent on the owner's behalf |
| Content Owner / Creator | View proposals for titles they are authorized to represent; accept, reject, or request changes | Cannot approve another owner's title or internal legal/QC gates |
| Studio representative | Act only for the Studio and titles within a verified organization mandate | Studio membership alone does not prove authority to sign |
| Authorized rights-holder signer | Accept a specific immutable proposal version within verified signing authority | Cannot alter the accepted terms after acceptance |
| Independent Legal Reviewer | Review evidence and legal scope; approve/reject with findings | Cannot approve a proposal they created or accept on behalf of the owner |
| QC Reviewer | Record technical QC decision | QC PASS is not legal approval or publication authorization |
| Publication operator / authorized internal role | Execute publication only after all required gates pass | Cannot bypass missing rights, legal, QC, or entitlement checks |
| Buyer | Access only its own authorized buyer-scoped records and permitted deliveries | No access to owner-side private evidence or internal QC/legal/finance controls |

### 3.2 Identity and authority checks

- Resolve the actor from the authenticated server session; never trust a client-supplied user ID, owner ID, organization ID, title owner, or signer role.
- Require the existing verified-actor mechanism and the current canonical Bridge profile/role checks.
- Resolve the title's owner and owning organization from server-side records.
- Verify active organization membership and an explicit signing-authority record or mandate scoped to the relevant organization, title/catalog, and action.
- Email match, display name, invitation possession, or ordinary organization membership alone is insufficient proof of signing authority.
- A representative's authority must be valid at the time of acceptance and retained as evidence.
- Reject inactive, expired, revoked, unverified, or ambiguous identities.
- Do not create another Super Admin, infer identity from email, or broaden existing internal roles.

### 3.3 Separation of duties

- Proposal creator cannot be the independent legal approver for that proposal.
- Owner acceptance must be performed by an authorized owner-side signer, not an internal Admin acting as the owner.
- Legal approval must be performed by a distinct authorized reviewer.
- QC decision must be performed by an authorized QC reviewer.
- Publication authorization remains a separate internal action.
- If policy requires two-person internal authorization for a high-risk exception, the two actors must be distinct and the exception must be explicit, scoped, and audited.

---

## 4. Agreement and proposal version model

### 4.1 Immutable proposal versions

Each proposal is a versioned snapshot. A version contains at minimum:

- stable proposal ID and monotonically increasing version number;
- title ID and server-resolved owner organization;
- intended channel / platform and business model;
- territory and language scope;
- permitted media/asset categories and distribution rights;
- start and end of the proposed license window;
- exclusivity and sublicensing permissions;
- commercial terms, calculation basis, currency, deductions, taxes, refunds, chargebacks, payment fees, settlement cadence, and reporting rules;
- agreement/evidence references and document version identifiers;
- proposer identity, creation time, and expiry time;
- a canonical terms digest/hash and schema version.

The exact canonicalization and cryptographic hashing algorithm must be selected and reviewed in Phase B. The digest must cover every legally or commercially material field and the referenced agreement document version/hash. A mutable URL alone is not evidence of an immutable agreement.

### 4.2 Editing and supersession

- A proposal version becomes immutable when sent to the owner.
- Any material change creates a new version and new digest.
- An acceptance applies only to the exact version and digest displayed to the signer.
- Sending a replacement version supersedes the earlier pending version and invalidates its outstanding acceptance token.
- A previously accepted version must not be silently edited. Amendments require a new version and renewed consent.
- Rejection, withdrawal, or expiry closes that version; a revised proposal receives a new version.
- The system must retain prior versions and their audit events under an approved retention policy.

### 4.3 Reference generation

- Generate a unique proposal/agreement reference server-side.
- Distinguish a proposal reference from an executed agreement identifier and from a legal case ID.
- A generated reference is an internal tracking identifier; it does not prove execution or ownership.
- Executed document references must point to actual uploaded/verified evidence, with access controls and integrity metadata.

---

## 5. Proposed lifecycle state machine

Proposal/acceptance state and title lifecycle are separate state machines.

### 5.1 Agreement proposal lifecycle

`DRAFT`  
→ `PENDING_OWNER_APPROVAL`  
→ `OWNER_APPROVED` or `OWNER_REJECTED`  
→ `LEGAL_REVIEW_PENDING`  
→ `LEGAL_APPROVED` or `LEGAL_REJECTED`  
→ `READY_FOR_LICENSE_AUTHORIZATION`  
→ `AUTHORIZED`  
→ `EXPIRED` or `REVOKED`

Additional terminal/administrative states: `WITHDRAWN`, `SUPERSEDED`.

Rules:

- `OWNER_APPROVED` means only that the authorized signer accepted the exact proposal version.
- Owner approval must not set a rights grant to authorized/valid and must not publish a title.
- Legal approval must be a separate decision with evidence and reviewer identity.
- `AUTHORIZED` is reachable only after all rights, mandate, agreement, legal, and internal authorization checks pass.
- `EXPIRED` is derived/enforced from the license window; it must not be treated as a manual substitute for revocation.
- `REVOKED` requires an authorized actor, reason, effective time, and audit event.
- No transition is accepted from a stale version or stale expected state.

### 5.2 Title and publication lifecycle

The title's QC and lifecycle states remain controlled by the existing title workflow. Agreement state does not automatically advance title status.

The publication gate independently verifies, at request time:

- title is eligible under the approved lifecycle policy;
- required QC has passed for the current asset version;
- the correct rights grant/license is authorized and not expired/revoked;
- the owner mandate and rights chain cover the exact distribution;
- territory, language, media, platform, exclusivity, and time window match;
- required legal and publication approvals exist;
- buyer/channel entitlement and delivery package are scoped correctly;
- required assets are verified and available through private, scoped access.

Any failed or missing check denies publication/playback (fail closed).

---

## 6. End-to-end data flow

### Step 1 — Admin prepares proposal

1. Admin opens the title's licensing workspace.
2. Server loads the canonical title, owner organization, rights grants, and current evidence.
3. Admin selects the intended in-house channel or external buyer, rights scope, term, and commercial terms.
4. Server validates that the proposed grant does not exceed the underlying rights/mandate.
5. Server creates a draft proposal version and audit event.
6. No owner notification is sent until the proposal passes server validation and is explicitly sent.

### Step 2 — Proposal is sent to owner

1. Server resolves the authorized owner/studio recipients from verified organization membership and signing authority.
2. Server creates a single-use, expiring, version-bound notification/action reference.
3. Notification contains a private dashboard deep link; it must not expose private evidence or accept terms through an unauthenticated URL.
4. Delivery failure does not change the proposal to owner-approved.
5. The owner dashboard reads the proposal from the server using authenticated access.

### Step 3 — Owner reviews and accepts/rejects

1. Owner opens the full proposal and agreement/evidence references.
2. UI displays all material terms and the exact version/digest.
3. Signer re-authenticates or completes an approved step-up authentication flow before acceptance.
4. Signer confirms authority and explicitly consents to the displayed terms.
5. Server re-checks identity, active membership, signing mandate, proposal state, expiry, version, and digest.
6. Server atomically records the decision, signer, timestamp, digest, consent text/version, and audit event.
7. Replayed or stale requests return a conflict and do not create a second acceptance.
8. Rejection/request-for-change records the actor, reason, and version; it does not modify the terms.

### Step 4 — Admin status synchronization

- Admin workspace reads canonical proposal state from the server/database; it must not rely on a browser event or client-side optimistic state as authority.
- A committed owner decision updates the canonical status and appends an immutable event in the same transaction.
- If asynchronous notifications or integrations are later required, use a transactional outbox with idempotent consumers.
- Admin receives a notification/invalidation after commit; refresh/reload must show the same canonical state.
- Owner approval transitions to `LEGAL_REVIEW_PENDING`, not directly to `AUTHORIZED` or `PUBLISHED`.

### Step 5 — Independent legal, QC, and authorization

- Legal reviewer checks ownership chain, mandate, executed agreement, territory, media, term, sublicensing, commercial terms, and applicable legal restrictions.
- QC reviewer independently verifies the current required technical assets and records a QC case.
- The license authorization service evaluates all prerequisites and records a distinct authorization event.
- Any change to the proposal after owner acceptance requires a new proposal version and renewed acceptance.

### Step 6 — Publication and ongoing enforcement

- Publication is a separate explicit operation.
- Runtime playback/download/delivery checks the active license and entitlement on every relevant request or via a safely bounded cache with revocation invalidation.
- Expiry/revocation blocks new playback, download, and delivery; outstanding signed URLs must be short-lived and revoked/invalidated where supported.
- Partner/Loop delivery must be idempotent, auditable, and limited to the permitted package.
- Publication acknowledgement is not proof of successful end-user playback; runtime playback evidence is a separate release check.

---

## 7. Consent, e-signature, and evidence model

At minimum, retain:

- authenticated signer subject ID and verified organization membership;
- authority/mandate record ID and validity at signing time;
- proposal ID, version, terms digest, and agreement document digest;
- exact consent statement text and consent UI/version;
- explicit acceptance/rejection action;
- trusted server timestamp (UTC);
- request correlation/idempotency ID;
- security-relevant authentication/step-up result;
- IP/device evidence only where necessary, proportionate, disclosed, access-controlled, and covered by retention/privacy policy;
- audit event ID and previous/current state.

A checkbox plus a click is not automatically a legally valid electronic signature in every jurisdiction or transaction type. Before production use, counsel must determine the applicable law, signer authentication strength, evidence/retention requirements, whether a qualified/regulated e-sign provider is required, and the legal effect of the proposed consent flow. Do not describe an agreement as executed solely because the UI recorded a click.

---

## 8. Audit and event model

Audit events are append-only from application workflows. Corrections are represented by compensating events, not destructive edits.

Suggested event types:

- `agreement.proposal_created`
- `agreement.version_sent`
- `agreement.version_superseded`
- `agreement.owner_approved`
- `agreement.owner_rejected`
- `agreement.owner_change_requested`
- `agreement.legal_approved`
- `agreement.legal_rejected`
- `agreement.authorization_granted`
- `agreement.revoked`
- `agreement.expired`
- `publication.requested`
- `publication.authorized`
- `publication.denied`
- `delivery.acknowledged`

Each event records actor, actor class, organization scope, title/proposal/version IDs, prior/new state, timestamp, correlation/idempotency key, reason, and relevant evidence digests. Never put secrets, raw authentication tokens, or unnecessary personal data in audit metadata.

Audit read access is role- and organization-scoped. Tamper-resistance, retention, export, and legal hold requirements must be decided before implementation.

---

## 9. Data ownership and proposed logical entities

This is a logical model, not a committed SQL schema. Names are provisional and must be reconciled with actual Testing schema, migrations, constraints, and existing code before Phase B.

| Logical entity | Purpose | Key relationships |
|---|---|---|
| Organization | Existing owner/studio/buyer/in-house organization registry | Memberships and authority records |
| Organization membership | User's active organization membership and role | Organization, authenticated user |
| Signing authority / mandate | Explicit authority to accept agreements | Organization, person, scope, validity, evidence |
| Agreement proposal | Stable proposal aggregate | Title, owner org, proposer |
| Agreement proposal version | Immutable terms snapshot and digest | Proposal, title, rights scope |
| Owner decision | Accept/reject/change request against one exact version | Version, signer, mandate |
| Legal review case | Independent legal decision and findings | Version/license, reviewer |
| License authorization | Internal authorization of exact approved scope | Title, rights grant, proposal version |
| Audit event | Append-only state/event history | Actor, org, title, proposal/version |
| Notification/outbox | Reliable delivery and synchronization | Proposal/version, recipient, idempotency key |

Do not create a second organization registry if the existing `bridge_organizations` can safely represent the required organization classes. Do not add a default organization classification until existing records have been inventoried and explicitly mapped.

---

## 10. Commercial terms and the Malayalakkara Residency example

The founder supplied the following intended commercial instruction for this title:

- Bridge / platform and distribution share: **35%**
- Content Owner share: **65%**

This is an example input for the proposal design, not a verified executed agreement and not a database value.

Before acceptance, the proposal must explicitly define:

- whether the split applies to gross captured collections or net eligible revenue;
- treatment of GST/taxes, payment gateway fees, refunds, chargebacks, discounts, promotional credits, and other deductions;
- currency and rounding method;
- whether Bridge's 35% is a distribution/platform fee or a revenue participation;
- settlement cadence, statements, dispute window, and payment obligations;
- effective date and treatment of transactions after expiry/revocation.

The two percentages must total 100% only if the contract defines a two-party allocation on the same calculation basis. Other titles may have different rates; no global default should be inferred.

---

## 11. Security requirements and negative-test acceptance criteria

The implementation must include API/server-action tests and authenticated runtime tests, not only UI tests.

| ID | Attack / scenario | Expected result |
|---|---|---|
| A01 | Unauthenticated user opens private proposal | Deny |
| A02 | Unverified user attempts owner action | Deny |
| A03 | User guesses another title/proposal ID | Deny without leaking existence |
| A04 | Creator without signing mandate accepts | Deny |
| A05 | Inactive/expired/revoked membership accepts | Deny |
| A06 | Studio member without title/catalog authority accepts | Deny |
| A07 | Client spoofs owner_org_id, signer_id, or role | Ignore client value; resolve server-side or deny |
| A08 | Internal Admin attempts to accept as owner | Deny |
| A09 | Proposal creator attempts independent legal approval | Deny |
| A10 | Owner accepts after proposal expiry | Deny |
| A11 | Owner accepts stale/superseded version | Deny |
| A12 | Terms/digest changed between display and acceptance | Deny; require new version |
| A13 | Acceptance token or request is replayed | Idempotent conflict; no duplicate decision |
| A14 | Concurrent accept/reject requests race | Exactly one valid terminal decision |
| A15 | Buyer A reads Buyer B proposal/license/evidence | Deny |
| A16 | Buyer A substitutes Buyer B organization ID | Deny |
| A17 | Owner approval is treated as legal approval | Deny |
| A18 | Legal approval is treated as QC approval | Deny |
| A19 | Approved license exceeds underlying rights/mandate | Deny |
| A20 | Wrong territory/language/media/platform/window | Deny |
| A21 | Expired/revoked license requests playback/download | Deny |
| A22 | Buyer accesses QC/legal/finance/internal notes | Deny |
| A23 | Notification delivery is duplicated or delayed | No duplicate state transition |
| A24 | Outbox consumer retries after timeout | Idempotent processing |
| A25 | Asset URL remains usable after authorization expires | Deny or expire within approved short TTL |
| A26 | Owner changes organization or mandate after proposal sent | Revalidate at acceptance; deny if authority no longer valid |
| A27 | Audit event update/delete attempted through app role | Deny |
| A28 | Old accepted proposal is amended in place | Deny; create a new version |

Positive tests must also prove that a correctly authorized signer can accept the exact active proposal version and that the Admin view reflects the committed decision without bypassing legal/QC/publication gates.

---

## 12. Failure handling and consistency

- Use database transactions for decision + state transition + audit event.
- Enforce uniqueness/constraints for one decision per proposal version and idempotency key.
- Use optimistic concurrency or row locking on proposal state/version.
- Never trust a client-reported current state.
- Notification delivery is retryable and must not control authorization state.
- If audit persistence fails, the decision transaction must fail.
- If authorization dependencies are unavailable, acceptance/authorization/publication must fail closed.
- Do not rely on eventual UI refresh as the source of truth.
- No dual-write between legacy `bridge_rights_grants` and a future proposal/license table without an explicitly designed transactional migration strategy.

---

## 13. Privacy, retention, and operational controls

- Collect only the evidence required for identity, authority, consent, and dispute resolution.
- IP/device collection requires documented purpose, disclosure, access restriction, and retention period.
- Encrypt private agreement files at rest and use short-lived, scoped access.
- Separate public catalogue metadata from private owner evidence and internal legal notes.
- Define retention, deletion, legal hold, and export policies with counsel.
- Log access to sensitive agreement evidence.
- Never expose raw storage keys, private agreement URLs, internal reviewer notes, or other buyer/owner records across tenant boundaries.

---

## 14. Phase A exit criteria

Phase A is complete only when reviewers agree on:

1. Actor/role and signing-authority matrix.
2. Agreement proposal/version lifecycle and state-transition rules.
3. Separation between owner acceptance, legal approval, QC, authorization, and publication.
4. Canonical terms snapshot and digest coverage.
5. Audit event fields, retention, and access policy.
6. Logical data model and compatibility boundaries with current `bridge_rights_grants`.
7. Commercial calculation basis and title-specific terms.
8. Security negative and positive test plan.
9. Legal review of e-sign/consent evidence requirements.
10. Phase B schema design can proceed without assuming unverified columns, enum values, IDs, or RLS helper functions.

### Open decisions before Phase B

- Which organization/signing-authority evidence is authoritative in the current schema?
- What legal jurisdiction(s) and electronic-signature assurance level apply?
- Which e-sign provider, if any, is approved?
- Is the 35/65 split gross or net, and what deductions apply?
- Which exact rights/mandate evidence fields and storage references are canonical?
- What retention period and legal-hold policy apply?
- Which owner/studio notification channel is approved?
- How will existing Loop `bridge_rights_grants` be mapped without duplicate or fabricated records?

---

## 15. Explicit safety boundary

**This Phase A document is architecture only.**

- No database/schema/RLS/Auth change has been made.
- No Testing or Production data has been read or modified as part of this document commit.
- No agreement has been created, sent, accepted, or executed.
- No legal or QC decision has been recorded.
- No license has been authorized.
- No title lifecycle or publication state has been changed.
- No application code or UI has been changed.
- No Preview/Production deployment has been triggered.
- Production remains **HOLD / NOT CERTIFIED / NO-GO**.

Phase B must begin with a fresh read-only Testing schema/migration inspection and a reviewed logical-to-physical mapping. Applying a Testing migration, running runtime tests that mutate data, opening a deployment-producing PR, or changing Production requires separate explicit authorization and the applicable isolation evidence.
