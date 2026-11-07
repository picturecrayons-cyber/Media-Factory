# Phase A — Creator/Studio Rights & Agreement Approval Workflow

**Status:** Architecture specification / review draft only  
**Scope:** Crayons Bridge; Creator, Studio and internal Admin workspaces  
**Production posture:** HOLD / NOT CERTIFIED / NO-GO  
**Implementation status:** Not implemented by this document. No schema, API, UI, RLS, deployment or production behavior is changed.

## 1. Purpose and non-goals

Define a versioned, auditable online proposal and acceptance workflow so an authorized rights owner or studio representative can review a title-specific license proposal in their workspace and submit an explicit decision. The Admin workspace reflects that decision without treating owner acceptance as legal clearance, rights authorization, QC approval, delivery authorization or publication.

This phase defines architecture and data flow only. It does not implement a migration, e-signature integration, API, UI, payment/revenue settlement or publication behavior. It does not certify rights for any title.

## 2. Source-grounded current-state observations

The following observations were checked against the repository default branch `main` while preparing this document:

- `src/lib/bridge/workflow-policy.ts` defines `loopLicenseInput`: one territory entry, one or more languages, required start/end timestamps, exclusivity, agreement and ownership reference strings, and owner/distributor percentages that must total 100. Its current Loop policy accepts `WORLDWIDE` only.
- `src/lib/bridge/workflow.ts` implements `saveLoopLicense()`. It inserts a `DRAFT` `bridge_rights_grants` record with `CRAYONS_LOOP` and `TVOD` in the media scope and stores agreement/ownership references and the two share percentages in evidence JSON. This path does not currently persist a buyer organization identifier on that grant.
- The same module has a separate `reviewWorkflow()` legal-review path. It requires a selected grant and rejects approval by the same user who created the grant. Legal review is therefore not equivalent to owner acceptance.
- `src/components/bridge/workflow-desk.tsx` currently presents a Loop-specific Business form and a separate review workflow. It is not the proposed Creator/Studio agreement inbox.

These are source observations, not runtime or production verification. The current schema, all call sites, migrations, RLS, route access and production behavior must be re-audited before implementation.

## 3. Actors, identities and authority

| Actor | May do | Must not do |
|---|---|---|
| Admin / authorized internal operator | Create proposal; select title, intended in-house channel or external buyer, proposed scope and commercial terms; send or withdraw an unaccepted proposal | Self-certify ownership, impersonate owner acceptance, or bypass legal/QC/publication gates |
| Creator / rights owner | View proposals for titles they are authorized to represent; accept or reject an exact version; request clarification | Change proposal terms, approve on behalf of another rights owner without a mandate, access another creator's contracts |
| Studio representative | Act only for a studio organization with active membership and explicit signing authority for the title/rights | Rely on studio membership alone where signing mandate is absent or expired |
| Independent Legal reviewer | Review evidence, flag exceptions, approve/reject the exact proposal version; must be independent of proposal creator and owner signer where policy requires | Treat a consent click as legal clearance or alter the accepted terms |
| QC reviewer | Record technical QC decision under existing QC authority | Approve rights or commercial terms |
| Publication authorizer | Authorize a specific eligible license/channel after all prerequisite gates | Infer authorization from owner acceptance or legal approval alone |
| System/service | Enforce state transitions, version hashes, idempotency, access control and audit | Invent evidence, signer authority, approval, or missing state |

Identity must resolve from the authenticated server session to the canonical Bridge profile and active organization membership. Do not trust browser-supplied role, owner ID, studio ID, title owner ID or organization ID. Email matching, display names and client metadata are not signing authority.

## 4. Proposal and agreement lifecycle

Recommended proposal lifecycle (separate from title lifecycle and license/publication lifecycle):

1. `DRAFT` — editable by authorized Admin operators only.
2. `PENDING_OWNER_APPROVAL` — immutable version snapshot issued to the authorized rights principal(s).
3. `OWNER_APPROVED` — authorized signer accepted that exact version.
4. `OWNER_REJECTED` — authorized signer rejected; no license authorization follows.
5. `OWNER_CHANGES_REQUESTED` — signer requests clarification; Admin must create a new version before resubmission.
6. `WITHDRAWN` — Admin withdrew an unaccepted proposal.
7. `SUPERSEDED` — a newer proposal version replaced this one.
8. `EXPIRED` — response deadline elapsed before acceptance.

Separate downstream states must remain independent:

- `LEGAL_REVIEW_PENDING` / `LEGAL_APPROVED` / `LEGAL_REJECTED`
- QC lifecycle and QC case outcome
- rights-chain / mandate verification
- license authorization, effective window, suspension and revocation
- channel publication, delivery acknowledgement and public availability

Owner acceptance must never directly set a title to `PUBLISHED`, mark a rights grant `VALID`, create an entitlement, or enable playback.

## 5. Versioning and immutable consent

Every proposal version must contain a canonical snapshot of all material terms, including:

- title ID and stable title identity;
- proposed licensee organization and distribution channel/platform;
- business model (TVOD/SVOD/AVOD or explicitly supported model);
- territories, languages, permitted media/use, exclusivity and sublicensing restrictions;
- start/end window and response/offer expiry;
- commercial basis, currency, revenue definition, share percentages, fees, taxes, refunds, chargebacks and settlement cadence;
- agreement/evidence document references and document versions;
- rights-chain declarations and any mandate scope;
- applicable legal terms, consent text and signer disclosure.

Canonicalize the snapshot and store a cryptographic digest (for example SHA-256) with the version. The signer accepts the digest-bound version, not a mutable live form. Any material change creates a new version and invalidates prior acceptance for the changed terms. Do not overwrite accepted versions.

The acceptance record should bind: proposal ID, version ID, snapshot hash, authenticated actor/profile ID, organization membership and signing-authority evidence, decision, exact consent text/version, timestamp, authentication assurance, and a unique idempotency key. Record IP/device/network data only where lawful, necessary, disclosed and governed by a retention policy; do not treat IP address as proof of identity or authority.

A checkbox and button alone do not guarantee a legally valid electronic signature. Determine applicable jurisdictional requirements and integrate an appropriate e-signature provider/workflow if required. Preserve provider transaction IDs, certificate/audit bundle references and completion status. Never fabricate a signature, signer, agreement reference or execution timestamp.

## 6. Data-flow specification

1. Admin server action authenticates the internal actor and checks title-level license permission.
2. Server resolves the title's verified rights principal(s), active organization(s), and signing mandate(s). If the rights chain or signer authority is ambiguous, proposal dispatch is blocked.
3. Server validates scope against the underlying rights evidence/grants. Proposed rights cannot exceed the rights actually controlled by the rights principal or Bridge mandate.
4. Server creates a proposal and immutable version snapshot, computes the digest, and writes an audit event in the same database transaction.
5. Notification is queued through an outbox pattern after commit. Notification links are authenticated and do not themselves grant access.
6. Creator/Studio inbox reads only proposals for which the authenticated principal has a verified, active relationship and signing authority. Full agreement documents use private storage and short-lived authorized access.
7. Acceptance/rejection endpoint reloads the canonical version from the database, rechecks actor identity, active membership, mandate, proposal state, expiry and digest, then atomically records the decision with idempotency protection.
8. Admin dashboard reads the persisted state from the server. UI updates are a view of authoritative server state, not a trusted client-side status update.
9. Owner acceptance advances only the proposal lifecycle to `OWNER_APPROVED` and creates a legal-review task. Independent Legal review, QC, rights authorization and publication remain separate gates.
10. Every transition writes an append-only audit event. Failed/denied actions should be security-logged without exposing another tenant's data.

## 7. Authorization and tenant isolation principles

- Enforce authorization in server handlers and RLS; UI hiding is not a security boundary.
- Resolve the owner organization and buyer/licensee organization independently. Do not conflate content owner, studio, distributor/intermediary, transaction buyer or in-house channel.
- Buyer A cannot read or mutate Buyer B proposals, agreements, licenses, evidence, entitlements or revenue records. The same isolation applies to Creator/Studio tenants.
- Use active membership plus explicit title/rights signing mandate. Membership alone does not grant contract-signing power.
- Do not use a broad `SUPER_ADMIN` membership shortcut. Internal access must use the existing verified internal-role model and least privilege.
- Reject client-supplied actor, owner, organization, role, signer, title ownership and approval state.
- Private agreement/evidence storage; scoped, short-lived downloads; no raw storage keys in client payloads.
- Reject replay, duplicate acceptance, stale version, expired proposal, revoked membership/mandate and concurrent conflicting decisions.
- Service-role database writes must still perform explicit server-side authorization because service credentials may bypass RLS.
- No self-approval: proposal creator cannot perform independent Legal approval. Apply additional separation-of-duties rules to signer and reviewer roles according to the approved policy.

## 8. Commercial terms: title-specific, versioned

For the illustrative `Malayalakkara Residency` proposal only, the user supplied a commercial instruction of **35% Bridge / 65% Content Owner**. This is not verified against an executed agreement and must remain marked `PROPOSED / AGREEMENT VERIFICATION REQUIRED` until supporting evidence and authorized approval are recorded.

The specification must not assume this rate applies to other titles. Each proposal version stores its own contract-defined commercial terms. Before acceptance, define whether the split applies to gross receipts or net eligible revenue and how taxes, payment processing fees, refunds, chargebacks, discounts, withholding and other deductions are treated. Define rounding and currency rules. The total share must reconcile to 100% only where the contract's model requires it; other participants or recoupment waterfalls may require a richer allocation model.

Illustrative arithmetic only: for ₹1,000 of the agreed share basis, 35% = ₹350 and 65% = ₹650, before any deductions not already reflected in that basis. This is not a settlement instruction.

## 9. Audit and evidence model

Proposed logical records (names are conceptual; reconcile against actual schema before migration):

- agreement proposal and proposal version;
- proposal party / authorized signer and mandate reference;
- immutable consent/decision record;
- legal review case and decision;
- evidence/document reference with version, hash, classification and access policy;
- append-only agreement lifecycle audit event;
- notification outbox / delivery attempts;
- e-sign provider envelope/transaction reference, if used.

Each audit event should include event ID, aggregate ID, version ID, actor subject, actor organization, action, previous/new state, timestamp, correlation/request ID, idempotency key where applicable, and a minimal metadata payload. Prevent update/delete by application roles; privileged retention or legal-hold processes must be separately controlled and audited. Do not place secrets, full sensitive documents or unnecessary personal data in audit metadata.

## 10. API contract outline (design only)

- Admin: create draft, edit draft, validate, issue proposal, withdraw unaccepted proposal, create superseding version.
- Creator/Studio: list authorized inbox items, read a specific proposal version, accept, reject, request changes.
- Legal: list assigned legal reviews, review evidence, approve/reject exact accepted version.
- Admin read model: retrieve proposal lifecycle, signer decision, legal status and audit history subject to role.
- Internal publication service: separate command requiring the complete rights/QC/legal/license eligibility checks.

All mutating endpoints require authenticated server identity, schema validation, authorization, state-transition validation, transactionality, idempotency and audit. Do not expose a generic endpoint that lets a client set arbitrary status values.

## 11. Acceptance and security test plan for later phases

At minimum test:

1. Unauthenticated user cannot read or act on proposals.
2. Creator A cannot read Creator B proposal or evidence.
3. Studio A member without signing mandate cannot accept.
4. Revoked/expired mandate cannot accept.
5. Client-supplied owner/org/signer ID spoofing is rejected.
6. Buyer A cannot read Buyer B proposal/license/agreement/revenue.
7. Proposal creator cannot approve Legal review of own proposal.
8. Owner acceptance does not set title `PUBLISHED` or license `AUTHORIZED`.
9. Modified terms after issue invalidate old digest and acceptance.
10. Duplicate acceptance is idempotent and creates one decision.
11. Concurrent accept/reject requests produce one valid terminal decision.
12. Expired or withdrawn proposal cannot be accepted.
13. Superseded version cannot be accepted.
14. Agreement file URL cannot be reused after expiry/revocation.
15. Legal rejection blocks downstream authorization.
16. QC failure blocks publication independently of owner acceptance.
17. Rights scope exceeding underlying mandate is rejected.
18. Sublicensing is denied unless explicitly included in the rights mandate.
19. Notification delivery failure does not create or imply acceptance.
20. Audit records cannot be modified by ordinary application actors.

Positive tests must also prove that the exact authorized rights owner can accept a valid, current version and that the Admin view reflects the persisted decision.

## 12. Phased delivery boundaries

- **Phase A (this document):** architecture, actors, lifecycle, versioning, audit, data flow and test requirements.
- **Phase B:** read-only Testing schema/migration reconciliation, then additive migration draft and RLS design. No apply in this phase.
- **Phase C:** Creator/Studio and Admin UI plus server API implementation on an isolated branch only after Phase B review.
- **Phase D:** automated security tests, including tenant isolation, signer authority, replay, stale version and separation of duties.
- **Phase E:** authenticated Preview verification only after Preview-to-Testing isolation is independently proven. No deployment-producing push without explicit approval and quota impact review.
- **Phase F:** separate Production readiness review and explicit approval. Production remains blocked until evidence-backed certification.

## 13. Open decisions before Phase B

1. Identify the canonical rights principal and authorized signer for each title; define mandate evidence and expiry.
2. Decide whether legal acceptance requires a qualified e-signature provider for relevant jurisdictions.
3. Define the revenue basis and deductions for each agreement template.
4. Confirm supported license scope dimensions (territory, language, platform, media, window, exclusivity, sublicensing).
5. Define whether one title may require multiple rights-holder consents and how conflicting decisions are resolved.
6. Reconcile conceptual records with existing `bridge_organizations`, `bridge_organization_memberships`, `bridge_rights_grants`, `bridge_legal_cases`, audit and document schemas before naming or creating tables.

## 14. Explicit safety boundary

This document is documentation-only. It does not authorize or perform:
- database schema changes, SQL execution, RLS/Auth/grant changes or data backfills;
- application code, API or UI changes;
- license creation, owner acceptance, legal approval, rights authorization or publication;
- GitHub merge, deployment, domain change, payment or email send;
- any Production mutation.

**Production: HOLD / NOT CERTIFIED / NO-GO.**  
**App-inu pani kittaruthu.**


## 15. Bridge-first agreement model and reference separation

**Product decision:** Crayons Bridge is the rights, agreement and authorization control plane. Therefore, the first workflow artifact for a new title/partner commercial relationship should be a **Bridge Agreement Proposal**, created and versioned in Bridge before any downstream channel-specific license draft is activated.

The intended sequence is:

1. **Bridge proposal draft:** an authorized internal operator creates a title-specific proposal in Bridge. Identify the actual contracting legal entity/entities, rights principal, proposed counterparty/licensee, intended distribution channel, rights scope and proposed commercial terms. “Crayons Bridge” is the product/control-plane name; it must not automatically be treated as a legal contracting person or rights owner.
2. **Rights and signer verification:** verify the rights principal, ownership/chain-of-title evidence, mandate and the authority of each proposed signer. If these are missing or ambiguous, the proposal may remain an explicitly unverified internal draft, but it must not be represented as an executed agreement or an authorized license.
3. **Counterparty review and acceptance:** the Creator/Studio or other authorized counterparty reviews the exact immutable proposal version and records acceptance/rejection. Acceptance is not by itself legal execution, rights authorization, QC approval or publication permission.
4. **Execution:** obtain the legally appropriate signatures/e-signature completion from all required parties. Store the executed document reference, version/hash and execution evidence separately from the proposal reference.
5. **Independent legal review:** an independent Legal reviewer verifies the executed agreement, parties, signer authority, ownership/mandate evidence, scope and commercial terms. A proposal acceptance must not auto-approve Legal.
6. **Rights and license authorization:** only after the required evidence and approvals pass may the authorized service create/activate a title- and counterparty-specific rights grant/license.
7. **Channel-specific activation:** create a downstream distribution license or entitlement for the selected buyer organization and distribution channel (for example, Crayons Loop + TVOD). This must not be confused with the upstream Bridge proposal or the executed master agreement.
8. **QC and publication gates:** QC, delivery readiness, publication authorization and public availability remain independent gates. No automatic publication follows from proposal acceptance or agreement execution.

### Required distinct identifiers

These identifiers represent different records and must never be overloaded into one another:

| Field / identifier | Meaning | May it substitute for another field? |
|---|---|---|
| proposal_reference | Unique Bridge-generated reference for a specific proposal/version (example format: BRIDGE-PROP-2026-MR-001; illustrative only) | No. It is not an executed contract reference. |
| executed_agreement_reference | Reference to the final agreement actually executed by the required parties, with its immutable document/version evidence | No. Never populate from a proposal number. |
| ownership_evidence_reference | Reference to the source document(s) proving ownership, chain of title or authority to license the relevant rights | No. It is not the proposal or agreement reference. |
| buyer_organization_id | Canonical Bridge organization ID of the legal/commercial licensee or transaction buyer | No. It is not a channel or display label. |
| distribution_channel_id | Canonical identifier for the delivery/distribution channel or platform (e.g. the Loop channel) | No. A channel is not necessarily the legal buyer or contracting party. |

The proposal should also identify the **contracting legal entity** independently from the Bridge product name, rights principal, intermediary/distributor, buyer organization and distribution channel. Confirm the exact legal entity from corporate and contract records; do not infer it from a UI heading or brand.

### Relationship to the current Production form

The current title page form labelled **“License to Crayons Loop · TVOD”** is a downstream Loop-specific license-draft surface. It is not, by itself, the Bridge-first proposal/contract workflow described above. Its existing fields (territory, languages, license window, executed agreement reference, ownership evidence reference, rights-owner share and exclusivity) should be populated only from verified, applicable evidence and a separately approved implementation. Do not put a Bridge proposal reference in its executed-agreement field.

For Malayalakkara Residency, the example reference BRIDGE-PROP-2026-MR-001 remains illustrative/proposal-only. The previously discussed 35% Bridge / 65% Content Owner split remains proposed and unverified until confirmed by the executed agreement. No territory (including WORLDWIDE), language scope, window or exclusivity is presumed.

This section is a design clarification only. It does not authorize saving a Production draft, writing database records, issuing a proposal to a counterparty, executing an agreement, creating a license, or changing publication state.
