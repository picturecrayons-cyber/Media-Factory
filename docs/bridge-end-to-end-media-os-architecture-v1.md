# Crayons Bridge — End-to-End Media OS Architecture (v1)

**Status:** Product architecture / implementation blueprint. Documentation-only proposal; not an implementation or release certification.
**Company:** StreamVista OPC Pvt Ltd.
**Product boundary:** Crayons Bridge is the B2B media operating system and rights/authorization control plane. Crayons Loop is the consumer streaming product. Bridge authorizes; Loop delivers.

## 1. Product vision

Crayons Bridge is one integrated operating system for the journey from story/IP discovery to production, secure footage custody, post-production, rights verification, financing, licensing, authorized delivery and revenue reconciliation.

It is not five separate applications. It is one platform with role-aware workspaces and a shared, canonical title/project record.

Core lifecycle:

1. Discover / create a story, screenplay, format or finished-content opportunity.
2. Verify creator identity, authorship declarations, chain of title and permissions.
3. Curate and match approved opportunities to eligible Studios, Buyers and Investors.
4. Agree a development, production, financing or acquisition mandate.
5. Plan production and capture footage with DIT-led ingest and verified backups.
6. Hand off controlled media packages to post-production.
7. Complete technical QC, legal review and rights clearance independently.
8. Package and license to authorized Buyers / Studios / destinations.
9. Deliver approved assets and, where separately authorized, publish a consumer package to Loop.
10. Reconcile service fees, licensing revenue, funding obligations, settlements and audit history.

A status in the product is not legal proof. AI can assist with matching, metadata, QC triage and workflow recommendations; it cannot establish copyright ownership, approve legal rights or autonomously release a title.

## 2. Workspaces and account model

The primary external workspaces are Creator, Studio, Buyer and Investor. Internal Admin is a privileged operational workspace, not a public signup type. Independent Agency is a separate organization/workspace capability for multi-principal agents; a Studio-appointed agent is a delegated Studio member.

| Workspace | Primary jobs | Must not receive |
|---|---|---|
| Creator / Rights Owner | Submit story/IP and finished titles; declare rights; manage consent; track review, deals, agreements, earnings and funding milestones | Other creators' private records; internal QC/legal notes unless released |
| Studio | Discover opted-in stories; manage development slate, production, crew, DIT, footage custody, post-production vendors, title packages, mandates and delivery | Other studios' tenant data; rights beyond its mandate |
| Buyer | Search approved/authorized opportunities; request pitch materials or screeners; negotiate and sign permitted licenses; receive authorized delivery | Internal Admin controls, private creator data without consent, masters without authorization |
| Investor | Discover approved funding opportunities; review consented proposals and authorized diligence; record commitments, agreements, milestones and repayments/returns reporting | Automatic title ownership, film rights, screeners, master footage, private documents without permission |
| Internal Admin | Command Center queues for intake, curation, QC, Legal, Rights, Finance, Licensing, DIT/storage exceptions, delivery, communications and audit | No universal bypass; every action remains role- and purpose-limited |
| Independent Agency | Manage its own organization, principals and verified mandates; act only within each mandate | Cross-principal access or actions outside the exact mandate |

An organization may have multiple members and multiple workspace memberships. A user may have more than one role only through explicit, verified membership grants and a visible workspace switcher. Do not create duplicate Super Admin identities.

### Identity rules

- Supabase Auth is the authentication/session authority; Bridge server-side profiles, memberships, mandates and RBAC are the authorization authority.
- Resolve access by immutable authenticated user ID plus active membership and verified organization/mandate records.
- Never grant roles from email address, email domain, user metadata, organization display name, client state or a URL parameter.
- Never hardcode an email address as a role rule. Buyer access must come only from a verified Buyer membership and active organization scope.
- The same authenticated person may have a separate Crayons Loop account/workspace mapping if explicitly authorized. Loop is not automatically the Bridge Buyer dashboard; expose a clear product switch only when the user has valid memberships in both systems.
- Studio-appointed Agent = delegated Studio membership. Independent Agency = its own tenant with a separate verified mandate from every principal.
- Mandates scope principal, agent, title/project, rights category, territory, language, platform/destination, permitted actions, duration, exclusivity, sublicense/delegation and revocation. No active mandate = no title rights action.
- Internal roles remain granular: `admin`, `super_admin`, `qc_reviewer`, `legal_reviewer`, `finance`, `viewer` and narrowly scoped operational permissions. `super_admin` is not a routine global bypass.

## 3. Story, screenplay and content pipeline

Support two distinct intake tracks:

### A. Story / IP opportunity (pre-production)

- Creator submits logline, synopsis, treatment, screenplay/pitch deck, genre, language, format, intended audience, development stage, rights/author declarations, option status, desired budget band and requested support.
- Allow progressive submission and draft save. Do not require a film master for a story-only submission.
- Private screenplay/treatment remains private by default. A Creator chooses what to disclose, to whom, for what purpose and for how long.
- Admin curation checks completeness, identity, authority declarations, duplicate/conflict signals and suitability. Legal review is a separate gate for chain-of-title questions.
- Matching engine recommends relevant Studios, Buyers and Investors based on genre, language, format, budget, territory, platform, slate and stated interest. It must not reveal private data before consent.
- Creator can approve a named recipient, material category, expiry and purpose. Log every view, download, expiry and revocation. Use watermarking and view-only access where appropriate.
- Buyer/Studio interest states: viewed, interested, request meeting/materials, pass, negotiation. A match is not an offer or rights grant.
- Deal paths: development option, shopping/representation mandate, commissioned writing, production partnership, acquisition or license. Each needs its own reviewed agreement.

### B. Finished / in-production content

- Canonical title record with immutable Bridge UUID; metadata, versions, assets, rights, parties, mandates, QC, legal, avails, offers, contracts, delivery and revenue attach to this record.
- Creator / Studio declares rights scope and release history. Worldwide availability is a declaration only until verified.
- Story concepts and finished-film submissions remain distinct, but can be linked through a project relationship with explicit permission and audit.

### Pipeline states

Use explicit, persisted state transitions and actor/time audit, not UI-only labels:
`DRAFT → SUBMITTED → CURATION → CONSENTED_MATCHING → INTERESTED → DUE_DILIGENCE → NEGOTIATION → AGREEMENT → DEVELOPMENT/PRODUCTION → POST_PRODUCTION → QC + LEGAL + RIGHTS → LICENSE_READY → DELIVERY_AUTHORIZED → DELIVERED → RECONCILIATION → CLOSED`.

A title may branch, pause, be rejected, or return for action. QC, Legal and Rights are independent approval gates. Any conflict, missing mandate, expired grant or uncertain authority becomes HOLD / LEGAL REVIEW / NOT VERIFIED.

## 4. Studio production, DIT and media custody

Studio Workspace includes a Production Desk with project slate, budget/schedule, crew/vendor assignments, call-sheet references, camera/media inventory, shoot-day ingest logs, post-production jobs and delivery readiness.

### DIT / AI-assisted on-set ingest

1. Register production, shoot day, camera, card/reel, camera roll, sound roll, operator, timecode/frame rate, codec, resolution, audio channels and checksum manifest.
2. DIT operator ingests original camera media to a controlled local/on-set staging station.
3. Verify file counts, sizes and cryptographic checksums (e.g. SHA-256) before marking a copy verified.
4. Create at least two independent verified copies on separate storage targets before card reuse. A third off-site/regionally separate copy is recommended when network and budget permit.
5. Upload encrypted resumable chunks to private object storage; record object version, checksum, upload session, source media ID, retention policy and verification result.
6. Do not delete or format camera cards until the responsible DIT confirms the required verified copies and the production's retention policy.
7. AI may assist with shot/scene metadata, transcription, proxies and anomaly alerts, but original camera files remain immutable; no AI transformation replaces the camera original.
8. Exceptions (checksum mismatch, incomplete upload, duplicate card, missing audio, failed copy) enter a visible DIT exception queue and block card clearance / downstream readiness.

### Asset lifecycle and post-production

- Preserve camera originals as immutable source assets; generate proxies and derived files as separate versioned assets.
- Track asset lineage: source card → verified original → proxy → edit/project file → review export → approved master → delivery rendition.
- Role-based access by production, title, vendor, job, asset class and expiry. Vendors receive only assigned job assets, not the full Studio library.
- Secure download uses short-lived, purpose-bound URLs; every access is audited. No public bucket or permanent shared URL.
- Support retention tiers, legal holds, deletion approval, recovery tests and documented restore objectives. Backup is not considered verified until restore testing passes.
- Post-production job workflow: brief → quote → authorization → controlled asset handoff → work-in-progress → review notes → QC → approved output → return/retention.
- Services can include ingest, backup, dailies, proxy generation, editing, VFX, color, sound, dubbing, subtitles, accessibility, mastering, delivery QC and localization.
- Do not promise a storage SLA, durability figure or recovery time until the chosen provider, configuration and restore tests prove it.

## 5. Rights, QC and legal authorization

Rights are scoped independently by title/version, rights owner/principal, authority chain, category, territory, language, platform/destination, exploitation, format, exclusivity, dates/time zone, holdbacks/blackouts, commercial model and sublicense/delegation.

- Rights availability engine returns AVAILABLE, CONFLICT, LEGAL REVIEW, BLOCKED or NOT VERIFIED.
- A license in one category does not imply another (e.g. TV rights do not automatically imply OTT rights).
- QC checks technical media specifications and deliverables. Legal verifies documents/authority. Rights engine evaluates scope and conflicts. These are separate.
- Buyer and Loop only receive packages after all required gates pass and a specific destination/territory/language/window is authorized.
- Investment, service payment or a story introduction never automatically transfers ownership, distribution rights or licensing authority.

## 6. Investor workspace and funding models

Support both funding categories:

1. **Production funding:** development, pre-production, production, post-production or finishing budgets.
2. **Pipeline-entry support:** QC, subtitles, dubbing, localization, accessibility, marketing assets, delivery preparation and buyer-market access services.

Investor journey: discover approved opportunities → Creator-authorized proposal → secure data room → diligence checklist → non-binding indication of interest → reviewed term sheet → legally verified agreement → approved funding receipt/disbursement record → milestones and evidence → completion/repayment/revenue-share reporting.

Controls:
- Public/approved opportunity profile by default; private data only with explicit, revocable, purpose-limited Creator consent.
- Separate access grants for pitch deck, screenplay, budget, identity documents, contracts, financial model, screener and master assets.
- Investor cannot browse all titles or download source masters by default.
- Funding agreement, rights license, production mandate and distribution agreement are separate instruments.
- No guaranteed returns, no automatic equity/participation, no pooled investment, escrow, securities offering or regulated crowdfunding workflow without Indian legal/regulatory advice and the required licensed partners/approvals.
- Razorpay is for approved Bridge service invoices and permitted platform charges, not a substitute for regulated investment custody or investor fund management. Any creator funding movement must be separately designed, legally reviewed and explicitly approved before enabling live money flows.

## 7. Command Center — one operational control plane

The Admin Command Center is a role-aware queue system, not an all-powerful screen. It should show only the work each internal operator is authorized to perform.

Core dashboards:
- Executive overview: pipeline volume, conversion, overdue queues, service revenue, licensing pipeline, delivery exceptions and risk indicators.
- Intake & Story Curation: new submissions, duplicate/conflict checks, consent status, match requests.
- QC Desk: technical review, asset/package readiness, failed checks and retest.
- Legal & Rights Desk: chain of title, mandates, conflicts, territory/language/platform availability, expiry and revocation.
- Production / DIT Desk: active shoots, ingest sessions, copy verification, failed checks, storage health and post-production handoffs.
- Studio Services Desk: quotes, approvals, jobs, vendor assignment, SLA clocks and service QC.
- Buyer & Licensing Desk: verified buyer onboarding, requests, negotiations, agreements, license windows and delivery eligibility.
- Investor & Funding Desk: consented opportunities, diligence, agreements, milestone evidence and finance review.
- Finance Desk: invoices, captured payments, refunds, service costs, licensing receipts, splits, taxes, payable/receivable and reconciliation.
- Delivery / Loop Desk: destination packages, publication eligibility, delivery receipts, takedown/revocation and sync failures.
- Release 1 communications: use existing Linear issue updates and GitHub PR comments for developer/owner progress. Do not build a custom Communications Desk or mailbox aggregation during Release 1.
- Security & Audit Desk: access reviews, failed authorization, consent events, exports, data-room access and immutable audit trail.

Sensitive actions require a reason, step-up verification where appropriate, dual control for high-risk finance/rights operations, and a recorded audit event. Admin UI visibility is not authorization; every server operation must enforce it.

## 8. Gmail and Hostinger Mail — deferred beyond Release 1

**Release 1 decision: HOLD.** Do not build a unified Communications Desk, connect or aggregate mailboxes, or add new inbox workflows as part of Release 1. Use the existing Linear issue updates and GitHub PR comments for developer/owner communication.

When a later, separately scoped release authorizes mail integration:

- Keep Gmail and Hostinger Mail as separate providers and identities; never assume one administrator may read every employee's mailbox.
- Connect only mailboxes explicitly authorized by the mailbox owner, with least-privilege scopes.
- Start with draft-first workflows. Sending requires separate approval of sender identity, message, recipient and audit policy.
- Link correspondence to a title/project, buyer, studio, creator, investor, vendor or contract only when an authorized user does so.
- An email is not proof of a rights grant, signed contract, payment or legal consent; the authoritative record remains in Bridge.
- Never expose OAuth tokens, SMTP credentials or mailbox secrets to browser code or another tenant.

## 9. Revenue plan

Revenue streams are separated so the user understands what is being charged and why:

| Revenue stream | Paying party | Charging basis | Control |
|---|---|---|---|
| Creator / story submission services | Creator (only for clearly described optional paid services) | Fixed fee / tier | No promise of buyer acceptance or deal |
| Studio SaaS | Studio | Subscription / seats / storage tier | Transparent quota, renewal and cancellation |
| Secure production storage | Studio / production | Storage + transfer + retention / restore tier | Metered usage, retention and deletion terms |
| DIT / ingest services | Studio / producer | Shoot day / media volume / managed package | Verified ingest evidence |
| Post-production services | Studio / producer / rights owner | Quote, milestone or service package | Approval, QC and acceptance |
| QC / localization / dubbing / subtitles | Owner / Studio / Buyer by contract | Per title, minute, language or package | Human QA and delivery acceptance |
| Licensing facilitation / distribution | Contracting rights owner / licensee | Contracted success fee or commission | Valid mandate, signed deal and reconciled receipt |
| Enterprise / integration | Studio, buyer or distributor | Annual / implementation fee | Scope and support terms |
| Investor diligence / data-room services | Contracting party | Fixed service fee where lawful | No success or return guarantee |

Do not double-charge the same service or hide deductions. Show quote, tax, payment status, refund policy, service completion, commission basis and net settlement clearly. All pricing remains configurable and inactive until approved. No paid upgrade, live charge or real payment test without explicit approval.

## 10. Razorpay and financial controls

- Use Razorpay only for approved platform/service invoices and other legally reviewed permitted payment purposes.
- Server creates orders; verify signature and webhook authenticity; use idempotency; grant service entitlement only after confirmed capture; handle refunds, disputes and reversals.
- Never trust client-side payment success, amount or user ID.
- Keep investment agreements and funding ledger distinct from service-payment orders. Do not use a standard payment link to collect investment capital without legal/regulatory approval.
- Finance dashboard reconciles invoice → order → captured payment/refund → service/job → tax → payable/receivable → settlement. No manual "paid" toggle without evidence.
- No live Razorpay action, payment link, order, refund or transfer is part of this architecture-only proposal.

## 11. Responsive experience and accessibility

One platform, one design system, three screen layouts:
- Mobile 360–390px: one column, bottom navigation, progressive forms, large touch targets, camera uploads, save/resume and no core-workflow horizontal scroll.
- Tablet: adaptive two-column layout, side navigation and touch-first review panels in portrait/landscape.
- Laptop 1366px+: full navigation, dense rights tables, filters, multi-title operations, audit and reports.
- Preserve drafts across device changes and network interruptions; explain errors and retry safely.
- Defer large media previews; use thumbnails/proxies until authorized.
- Keyboard navigation, focus visibility, contrast, semantic labels, screen-reader announcements and reduced motion.
- Buyer never sees internal Admin controls. Tenant and title isolation is enforced server-side, not by hiding navigation.

## 12. RBAC / authorization matrix (starting policy)

| Capability | Creator | Studio | Buyer | Investor | Agency | Internal role |
|---|---|---|---|---|---|---|
| Manage own profile / org | Own | Own org | Own org | Own profile/org | Own agency | Administer per assigned scope |
| Submit story/title | Own | Authorized org titles | No | No | Only with mandate | Intake on behalf only with logged authority |
| View private proposal | Own | Only shared/mandated | Only consented | Only consented | Only mandated | Need-to-know, audited |
| Manage shoot / DIT | Own production | Own/mandated production | No | No | Only if mandate explicitly includes production ops | Assigned DIT/ops role |
| Access raw masters | Own/authorized | Assigned production | No by default | No by default | Only exact mandate | Storage operator / QC purpose |
| QC decision | No | No self-approval | No | No | No | qc_reviewer |
| Legal approval | No | No | No | No | No | legal_reviewer |
| Rights grant / license | Owner/signatory | Only delegated signatory | Licensee rights only | No automatic rights | Only exact mandate | Authorized legal/licensing roles |
| Funding proposal | Own | Own/authorized slate | No | Review/commit under agreement | No unless mandate | Finance review |
| Finance settlement | Own statements | Own org statements | Own invoices | Own agreed reports | Own fee statements | finance |
| Admin configuration | No | No | No | No | No | Narrow admin permission |

All access checks must include user, active organization membership, tenant, title/project, resource classification, action, consent, mandate scope, expiry and destination. Deny by default. Enforce with server-side authorization and database RLS/GRANT policies; test both allowed and denied cases.

## 13. Canonical records and audit model

Keep one canonical Bridge title/project UUID. Suggested domain aggregates (names are conceptual until reconciled with the actual schema):
- organizations, memberships, workspace_roles, invitations;
- creator_profiles, story_concepts, screenplay_assets, consent_grants, recipient_access;
- titles, title_versions, rights_parties, mandates, rights_grants, avails, conflicts;
- productions, shoot_days, media_cards, ingest_sessions, asset_copies, checksums, asset_lineage;
- postproduction_jobs, vendors, quotes, deliverables, qc_reviews;
- buyer_profiles, buyer_interests, deal_rooms, negotiations, agreements, licenses;
- investor_profiles, funding_opportunities, diligence_grants, commitments, funding_milestones, funding_ledger;
- service_catalog, quotes, invoices, payment_events, refunds, commissions, settlements;
- delivery_packages, destinations, publication_events, takedowns;
- mailbox_connections, correspondence_links, audit_events.

Do not create these tables blindly. Reconcile each concept against existing migrations and code first. Preserve the canonical Supabase project and existing title authority. No new identity system, duplicate Super Admin, second title authority or parallel production database.

## 14. Implementation sequence and gates

**Phase 0 — evidence and architecture**
- Complete source-only audit of current routes, server functions, schema, RLS, storage and payment flows.
- Map existing Story Concept, Investor, Studio Services, resumable upload, OCI, Admin Workstations and revenue modules to this blueprint.
- Record gaps and reuse existing work; avoid duplicate features.
- Define mobile-first wireframes and permission matrix.

**Phase 1 — safe UX and workflow foundation**
- Creator story/title intake with consent controls and save/resume.
- Buyer/Studio matching and controlled data room.
- Workspace switcher and role-aware navigation.
- Studio production slate and post-production job workflow.

**Phase 2 — secure production media**
- DIT ingest manifests, checksum verification, multiple copies, resumable encrypted upload, restore tests and exception queues.
- Vendor-scoped asset handoff and immutable source/proxy lineage.

**Phase 3 — Command Center and authorization**
- Unified queues and dashboards; least-privilege RBAC; tenant/title/mandate isolation; audit and dual-control actions.
- Independent QC, Legal and Rights gates.

**Phase 4 — commercial workflows**
- Quotes, service orders, invoice/payment reconciliation, licensing agreements and delivery.
- Investor opportunity/data-room/commitment/milestone workflows only after legal review.

**Phase 5 — integrations and Loop**
- Bridge-to-Loop publication package with strict authorization, territory, language, window and revocation synchronization.

**Deferred beyond Release 1:** Gmail/Hostinger mailbox connections, a custom Communications Desk, and inbox aggregation. Keep provider accounts separate and draft-first if a later approved release takes up this work.

### Hard release gates

- Release 1 scope and owner-facing progress follow Linear CRA-168: five gated steps, with evidence and explicit owner OK required before a step is marked Finished.
- Use existing Linear issue updates and GitHub PR comments for developer/owner communication; a custom Communications Desk and Gmail/Hostinger aggregation are deferred beyond Release 1.
- Existing Preview isolation gate CRA-128 must be proven before any STAGING DB query, runtime test or migration. Until then, no STAGING DB activity.
- PRODUCTION DB: no schema, RLS, Auth, storage or data changes under this proposal.
- No main merge, production deployment/promotion, real Razorpay payment/refund/transfer, real email send, paid plan upgrade or external funding movement without separate explicit approval.
- Exact SHA CI, matching Preview, isolated database proof, RLS positive/negative tests, role × tenant × title × action tests, Buyer A/B and Studio A/B isolation, mandate expiry/revocation, consent revoke, storage checksum/restore, payment webhook idempotency, email sink tests and accessibility/device acceptance are required.
- Production remains HOLD / NOT CERTIFIED / NO-GO until independently evidenced.

## 15. Acceptance tests

- Mobile 360px and 390px: Creator submission, Buyer request, Studio shoot-day ingest status, Investor proposal review and Admin queue are usable without core horizontal scrolling.
- Tablet portrait/landscape and laptop 1366px+: no layout break; no state loss on resize/rotation.
- Creator can revoke a proposal share; recipient loses access immediately and audit event remains.
- Buyer A cannot see Buyer B data; Studio A cannot see Studio B data.
- Investor cannot view a proposal, financial model, screener or master without separate valid consent/authorization.
- Agent without active mandate cannot view or act on the title; expired/revoked mandate immediately blocks access.
- DIT card cannot be marked clear until required independent copies and checksums pass.
- Restore test reproduces the verified source asset and checksum.
- QC approval cannot bypass Legal/Rights; Legal approval cannot bypass QC.
- Investment record cannot silently create title rights or Loop publication.
- Loop only receives the authorized consumer package, never legal documents or source masters.
- Payment webhook replay does not duplicate entitlement or settlement.
- Gmail/Hostinger connection cannot expose another mailbox or send without approved sender/action policy.

**Non-negotiable:** App-inu pani kittaruthu. Build additive, evidence-gated, reversible changes; keep Production HOLD.


---

## 16. Architecture v0.1 reconciliation addendum

**Purpose:** Close operational-contract gaps identified during the v0.1 review while preserving the existing architecture blueprint. This addendum is part of the same proposal; it does not certify implementation, approve a migration, or authorize a release.

### 16.1 Authority and system boundaries

- **Crayons Bridge is the sole B2B authority** for title identity, source/master custody records, QC decisions, legal evidence, rights grants, buyer mandates, licensing, delivery authorization and publication authorization.
- **Crayons Loop is downstream delivery only.** It may manage viewer identity, catalogue presentation, subscription/TVOD entitlements, playback sessions and viewing progress, but it must consume a current Bridge-authorized publication. It must never create, infer, widen or renew Bridge rights.
- Windows Media Factory / Local Media MCP and FFmpeg are processing tools. Their successful output, checksum, upload, payment, AI result or workflow status is not rights approval or publication authorization.
- Every publication and delivery references an immutable Bridge title UUID and a specific approved publication/version. Loop acknowledges and serves that exact version.
- Missing, stale, conflicting, expired or revoked authorization fails closed. Revocation and expiry block new access and trigger bounded invalidation of active delivery capabilities.

### 16.2 Canonical account roles, identity and organization isolation

Release 1 external account roles are **Admin, Buyer, Investor, Creator and Studio**. QC reviewer, Legal reviewer, Finance, DIT operator and other operational duties are narrowly scoped permissions, not additional public account types.

- Account RBAC is independent of payment, subscription and service entitlements. Payment does not create a role, organization membership, title right or mandate.
- Supabase Auth is the authentication authority. Bridge authorization resolves immutable auth.users.id to the Bridge profile (bridge_profiles.user_id), then to active, explicitly approved memberships and mandates. Intended identity mapping: bridge_user_id → bridge_profiles(user_id), auth_user_id → auth.users(id). Do not substitute email, display name, metadata or Better Auth identity.
- A person may belong to multiple Studio organizations. Each Studio membership requires separate approval, status, scope and audit history. Membership in Studio A grants no access to Studio B.
- Buyer access is scoped to the verified Buyer user, active Buyer organization, exact title, current mandate/license and permitted action. Buyer A cannot enumerate or access Buyer B resources.
- Creator dashboard access is a required first-class workspace, not Admin-only. Studio dashboard covers organization/member administration, production and DIT workflows under server-side organization scope.
- Do not introduce a sixth public Agency role in Release 1 without a separately reviewed product decision. Any existing Agency capability remains explicitly delegated and deny-by-default until its authority and tenant model are approved.
- Self-approval is prohibited for high-risk rights/legal/finance actions. Enforce submitter/reviewer separation and dual control where policy requires it.

### 16.3 Source master, upload and transfer contract

- The camera/source master is immutable after verified ingest. A replacement is a new version with lineage; never overwrite the original object in place.
- Upload initiation creates a server-authoritative, actor/title/asset-bound session with a short-lived scoped capability. The server owns the expected object key, provider multipart upload ID, part manifest, expiry and finalization state.
- Browser memory or IndexedDB may assist retries but is not authoritative evidence. Persist completed-part metadata server-side and reconcile it with the storage provider before resume or completion.
- Require contiguous, non-duplicated part manifests, provider-side multipart completion, final object HEAD/size verification and independent SHA-256 verification before marking an asset storage-verified.
- Retry is idempotent and bounded with backoff. Cancellation, abandoned-session cleanup, network interruption, browser restart and worker restart need explicit recovery states. Never delete a completed source part/object merely because a client request timed out.
- Upload progress distinguishes client-acknowledged bytes, provider-confirmed parts, multipart completion, object verification and checksum verification. A percentage or UI Ready label alone is not proof.
- Windows Local Media MCP allowlists source directories, rejects traversal and unsafe symlinks, exposes read-only listing/metadata/hash operations by default, and never exposes arbitrary shell execution or OCI credentials to the browser.

### 16.4 Storage provenance, integrity and backup

Every verified asset retains provider, bucket, namespace, region, endpoint, canonical object key, object/version identifier where available, size, content type, ETag (provider metadata, not a universal checksum), expected and observed SHA-256, verification time/actor/tool and source lineage.

- Internal storage provenance, object keys, signed URLs and credentials are never exposed in Buyer-facing DTOs or public Loop responses.
- Master assets and legal evidence remain private and immutable under retention/legal-hold policy. Derivatives are separate versioned assets.
- A backup is not verified merely because a copy/upload succeeded. Record independent target identity, checksum comparison, restore test, restore result, timestamp and responsible actor.
- Define and measure restore objectives before promising an RPO/RTO or archive SLA. No automatic source/legal asset deletion without a separately approved retention and recovery policy.

### 16.5 Media processing and technical QC

- Probe media with recorded tool/version and technical metadata. Generate ABR renditions only from an approved source; do not upscale. Default candidate ladder is 1080p / 720p / 480p, with 360p only when justified by product/device requirements and verified output quality.
- Keep source master, mezzanine, proxy, review screener, delivery master and streaming renditions as distinct asset classes with explicit lineage.
- Technical QC is independent from Legal and Rights. Record test profile/version, measured result, defects, retest, reviewer and approval time.
- The seven-file delivery package is main film, trailer, vertical poster, horizontal artwork, thumbnail, subtitles and censor/legal certificate. Main film is required; trailer may be optional where policy allows. A file is Ready only after storage and content verification. The latest authoritative version controls readiness; a newer pending replacement blocks an older Ready version from silently satisfying the gate.
- Seven files present does not mean QC, Legal or Rights approval. Missing/invalid documents and unresolved defects remain HOLD / NOT VERIFIED.

### 16.6 Rights, Legal and publication contract

Legal evidence, technical QC and rights authorization are independent gates. Legal review records evidence class, issuer/source, document version, asset checksum, title/version scope, reviewer, decision, reason and time. A checksum proves file identity, not document authenticity or ownership.

A Bridge publication event binds at minimum:
- Bridge title UUID and title/version;
- exact approved metadata and asset versions;
- delivery package and verified delivery asset references;
- QC decision and Legal evidence/decision references;
- rights grant, principal/holder, mandate and permitted action;
- territory, language, platform/destination, exploitation category and commercial model;
- effective start/end timestamps and timezone, holdbacks/blackouts, exclusivity and sublicense scope;
- monetization/price model where applicable;
- approving actor(s), timestamps, audit event and publication version.

Loop acknowledges the exact publication version and rejects stale, superseded, revoked or expired versions. Catalogue eligibility is not playback authorization; playback and checkout independently recheck the current Bridge publication, territory/window and viewer entitlement.

### 16.7 Private delivery and playback

- Use short-lived capabilities bound to authenticated actor, exact asset/version, purpose, permitted method and expiry. A long-lived query-string bearer token must not be the sole authorization.
- Recheck current Bridge publication/rights state and Loop viewer entitlement at the protected delivery boundary. Apply byte-range handling without exposing the master object or provider credentials.
- Define and test revocation propagation and the maximum residual access window for already-issued capabilities. If the Bridge authorization service or required state is unavailable, deny new protected access.
- DRM, DASH, device certification, offline downloads and production playback remain NOT VERIFIED until independently tested on supported clients and deployment targets.

### 16.8 Payment and entitlement separation

- Bridge B2B service invoices/licensing finance and Loop consumer subscription/TVOD are separate business boundaries with distinct order namespaces, webhook secrets, ledgers and reconciliation.
- One canonical fulfillment contract defines the idempotent transition from verified payment event to the specific service or viewer entitlement. No alternate Edge Function/webhook path may independently grant the same entitlement.
- Verify provider webhook signature, event identity, order/user/product binding, amount, currency, capture state and replay/idempotency before recording fulfillment. Persist the payment event/ledger transition before making entitlement available.
- Model refund, partial refund, dispute, reversal, expiry and revocation explicitly. Payment capture is not a rights grant; payment success does not override Bridge publication eligibility.
- Test mode and synthetic events only until separate approval authorizes live payment activity. No real charges, refunds or transfers are authorized by this architecture addendum.

### 16.9 Cost, observability and operational recovery

Track storage capacity, request/API operations, worker compute, transcoding, CDN/egress, archive retrieval, database/logging and retry overhead by title/project and service order where possible. Bound worker concurrency and retry budgets. Cost visibility must not disclose internal cost basis or margin to customers, Buyers or unauthorized Studio members.

Every critical workflow needs correlated audit and recovery evidence: actor, tenant, title, action, request/session ID, before/after state, provider response class, retry count, checksum/version, timestamp and final disposition. Secrets and signed capabilities are redacted. Recovery workers are idempotent and reconcile provider state before changing local state.

### 16.10 Database, migration and release controls

- Bridge Testing DB (jbymleftneggcgutlcqu) is the proposed shared STAGING target for Bridge and Loop only after CRA-128 proves deployment/project/environment isolation. Bridge Production DB (mlmgugivsyoxzdgwkbpu) is PRODUCTION and never a test target.
- Before any STAGING write, reconcile migration ledger entries against exact source file hashes, live schema objects, constraints, indexes, triggers, functions, grants, RLS policies, default ACLs and identity dependencies. A missing ledger version is not permission to replay a migration.
- Current work authorization is READ-ONLY review only. No migration execution or schema/data write is authorized here.
- Required release sequence: architecture review → complete repository/diff reconciliation → CRA-128 Preview isolation proof → READ-ONLY STAGING schema/security reconciliation → separately approved isolated implementation → exact-head checks and authenticated Preview tests → independent Bridge and Loop certification.
- Production remains **HOLD / NOT CERTIFIED / NO-GO**. No Production query, write, migration, merge, promotion, deployment, payment, refund, customer email or paid upgrade is authorized by this document.

### 16.11 Unresolved decisions and explicit non-certification

Unresolved evidence/decision items include canonical object-storage provider/region and backup topology; exact schema/table mapping and migration state; publication acknowledgement/revocation protocol; signed delivery token format and residual revocation window; supported ABR/device/DRM matrix; retention/legal-hold and restore objectives; payment ledger ownership across Bridge and Loop; exact DIT hardware/filesystem adapters; cost allocation and customer-facing pricing.

This document describes intended contracts. It does not prove that code, database policies, storage objects, Preview deployments, Windows ingest, payment flows or playback currently satisfy them. Each item requires source review and evidence at the exact deployed commit. **Architecture status remains REVIEW REQUIRED; repository status PARTIAL; STAGING READ-ONLY / ISOLATION GATE; PRODUCTION HOLD / NOT CERTIFIED / NO-GO.**

**Non-regression rule:** App-inu pani kittaruthu.
