# Bridge Sensitive Server-Function Inventory and Explicit Studio Context Gate

Date: 2026-11-11
Repository: picturecrayons-cyber/Media-Factory
Branch: chore/staging-readonly-schema-audit-20261110
Inventory ref: e9e1f40ad42c8c02475394e6935f053d18be8f6a

## Status and change boundary

- Status: DESIGN / SOURCE-REVIEW ONLY — NOT CERTIFIED.
- This document does not implement or enable a runtime guard.
- No database, migration, RLS, grant, storage, production, deployment, or merge operation is authorized or performed.
- Existing RBAC and session behavior remains unchanged.
- The source inventory below covers the Bridge server-function modules found in the inspected repository tree and GitHub search results at the inventory ref. It is a reviewed inventory, not proof that every server function elsewhere in the monorepo has been enumerated. A repository-wide AST scan and call-site reconciliation remain required before implementation.

## Environment and access ledger

| Environment | Action | Access | Risk | Result |
|---|---|---|---|---|
| GitHub Draft branch | Read source and add this design document only | WRITE — GitHub branch | Low; documentation only | Draft change |
| STAGING DB: Crayons Projects - Testing DB, project jbymleftneggcgutlcqu | No operation | NO ACCESS / no DB WRITE | None introduced | Unchanged |
| PRODUCTION DB: project mlmgugivsyoxzdgwkbpu | No operation | NO ACCESS / NO WRITE | None introduced | HOLD |
| Merge / deployment / promotion | No operation | NO ACTION | None introduced | HOLD |

## Authorization contract

### A. Request identity and selected Studio context

1. Derive the authenticated user exclusively from trusted server middleware/session context. Never accept userId from request payload as identity.
2. For a Studio-owned operation, require an explicit, validated `selectedOrganizationId` in the server-function input (or in a server-established request context with an equally explicit contract).
3. On every request, load current membership and organization status from the authoritative database. Require:
   - membership.user_id = authenticated Bridge user;
   - membership.organization_id = selectedOrganizationId;
   - membership.status = 'active';
   - organization.status = 'active'.
4. Bind the resource to the selected organization: for a Studio title, require title.owner_account_type = 'studio' and title.owner_organization_id = selectedOrganizationId. Do not use a cached session organization list as final authorization proof.
5. Do not infer an organization from organization_name, email domain, profile.organization_id, first membership, title owner, or client state.
6. If the caller is a Studio member with multiple active memberships, no default organization is selected. Missing, blank, unknown, foreign, invited, suspended, removed, or closed-organization context fails closed.
7. Non-Studio personal ownership, Buyer/Investor entitlements, and internal staff access use their own authorization predicates. Do not require Studio context for those paths. If a request attempts to provide a Studio organization context for a non-Studio actor, reject it unless an explicitly reviewed cross-role workflow defines otherwise.
8. Internal Admin/QC/Legal/Finance permissions do not automatically grant Studio membership. Staff access remains governed by the specific staff permission and title/workflow scope.
9. Every operation must re-check current membership, organization status, resource ownership, and role/permission immediately before sensitive side effects. A check at login or page load is insufficient.

### B. Resource-class rules

| Resource class | Required authorization |
|---|---|
| Studio title read | Explicit selected organization + fresh active membership + title.owner_organization_id equality + role/read permission |
| Studio title write / workflow transition | Same as read plus title-specific mutation permission, lifecycle transition and state preconditions |
| Studio asset list/read | Selected organization + fresh membership + parent title organization equality + asset/title relationship |
| Upload URL / multipart start, commit, abort / confirmation | Revalidate selected organization and parent title/asset relationship on every call; use server-loaded asset key and owner fields; never trust client object key as authorization |
| Download / signed download | Revalidate parent title organization and current membership, then apply asset-kind policy and Buyer/Investor license entitlement where applicable |
| Loop publication / licensing | Revalidate title organization for Studio owner actions; keep Bridge rights authority and Loop publication gates distinct; no publication solely from a client-supplied organization |
| Buyer / Investor | Existing buyer visibility, assignment and entitlement predicates; no Studio membership implied |
| Creator personal title | Authenticated owner and title-level permission; no Studio organization inferred |
| QC / Legal / Finance / Admin | Exact staff permission plus title/workflow authorization; no implicit Studio membership |
| DIT | Separate exact assignment predicate for authenticated user + production + title + asset; generic staff role or Studio membership alone is insufficient |
| Public site content | Public read path remains public; mutation requires its explicit administrative permission |
| Identity / onboarding | Identity link and onboarding rules remain separate from organization membership authorization |

### C. Signed URL and multipart invariants

- A signed URL is a bearer capability. Do not issue it until all identity, membership, organization, title, asset-kind, state and permission checks pass.
- The object key must be derived from a trusted database row or server-side key builder, never from a client-provided arbitrary key.
- Keep URL lifetime bounded by the existing policy. Do not lengthen it as part of this work.
- Multipart commit/abort must resolve the upload by server-owned asset ID and stored key. A client-supplied part URL must be validated against the expected storage origin/path and upload session; do not blindly fetch arbitrary URLs (SSRF risk).
- Revalidate membership and resource scope for begin, commit, abort, confirm and download, not only for the initial upload request.
- Revocation after a URL has already been issued cannot retroactively revoke a bearer URL. Record this residual risk and keep expiry short; consider a proxy/indirection design only as a separately reviewed future change.

## Server-function inventory

The list below records exported Bridge `createServerFn` endpoints and the adjacent Loop consumer endpoints found by the inspected GitHub code search and tree review. “Studio context” means required when the target record is Studio-owned; non-Studio and staff branches retain their separately authorized paths. This is broader than the first pass, but repository-wide AST enumeration and call-site reconciliation remain open.

### Titles — src/lib/bridge/titles.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| createTitle | POST | Create | Require explicit organization for Studio creation; fresh active membership; persist owner_organization_id from verified selection |
| listTitles | GET | Read/list | Studio list must be filtered to selected org and revalidated membership; no union of all memberships as implicit selection |
| getTitle | GET | Read | Require selected org for Studio-owned title; retain separate Buyer visibility and Investor assignment checks |
| updateTitle | POST | Write | Revalidate selected org, title owner org, role permission and editable lifecycle state |
| advanceTitle | POST | Workflow write | Same scope plus transition permission and lifecycle checks |
| listAuditLogs | GET | Sensitive read | Staff audit permission; if scoped to Studio/title, constrain to selected org and title scope; avoid unrestricted cross-tenant audit exposure |

### Assets — src/lib/bridge/assets.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| requestAssetUpload | POST | Signed upload URL | Require selected org, active membership, title owner-org equality, upload permission and uploadable title state before signing |
| beginAssetMultipart | POST | Multipart capability | Resolve asset → title → organization; revalidate current membership and upload permission before creating multipart session |
| commitAssetMultipart | POST | Multipart write | Revalidate asset/title/org and upload session; use stored server-side key; validate supplied part URL against expected storage session/origin |
| abortAssetMultipart | POST | Multipart write | Same revalidation and trusted stored key; abort only the caller-authorized asset upload |
| confirmAssetUpload | POST | Storage verification + DB write | Revalidate asset/title/org, creator/assignment and state before object verification and persistence |
| requestAssetDownload | POST | Signed download URL | Revalidate selected org and title/asset scope; then apply downloadDecision and applicable Buyer entitlement |
| listTitleAssets | GET | Asset read | Require title read permission and selected org for Studio title; do not expose private storage keys to Buyer |

### Workflow — src/lib/bridge/workflow.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| submitLoopLicense | POST | Rights/licensing write | For Studio-owned title require selected org + active membership + title-org equality; validate rights payload |
| reviewTitleWorkflow | POST | QC/Legal write | Staff permission and title workflow scope; Studio membership is not a substitute for QC/Legal permission |
| getTitleWorkflow | GET | Rights/QC/Legal read | Studio owner read requires selected org; buyer/internal branches remain separately constrained |
| getTitleRevenue | GET | Finance-sensitive read | Require title finance permission and selected org for Studio owner; preserve finance staff scope |
| recordSettlementEvidence | POST | Finance write | Finance permission + title scope; selected org for Studio title; evidence remains unverified until independently reconciled |

### Loop publication — src/lib/bridge/loop-publication.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| listLoopPublicationReadiness | GET | Publication read | Studio title must be in selected org; otherwise require exact staff/rights permission |
| authorizeLoopPublication | POST | Publication authorization | Require title-org context for Studio owner and all existing rights/QC/finance publication gates |
| suspendLoopPublication | POST | Publication control | Revalidate selected org or exact staff permission; verify target publication belongs to authorized title |
| revokeLoopPublication | POST | Rights/publication revoke | Same scope; fail closed on missing/expired/revoked rights evidence |
| extendDistributionWindow | POST | Rights write | Require title-org context and explicit rights authority; validate dates/territories |
| getLoopPublication | GET | Publication read | Resolve publication to title and enforce selected org or applicable staff/Buyer visibility |

### Multilingual rights — src/lib/bridge/multilingual-rights.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| listLanguageRights | GET | Rights read | Require selected org for Studio-owned title and title read permission |
| createLanguageRight | POST | Rights write | Require selected org, active membership, title-org equality and rights permission |
| createLicensePackage | POST | Licensing write | Resolve all included rights to the same authorized title/org; reject mixed-tenant IDs |
| listLicensePackages | GET | Licensing read | Scope packages through their title and selected organization |
| authorizeLanguagePackage | POST | Delivery/license write | Revalidate package, title, every referenced right and selected org before authorization |

### Story / Concept — src/lib/bridge/story-concept-api.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| createStoryConceptSubmission | POST | Create | Current code accepts organizationId and checks membership from session-derived IDs; change target is explicit request selection plus fresh DB revalidation |
| listMyStoryConcepts | GET | Read/list | Scope Studio concepts to one selected org; do not silently union all active memberships |
| listPendingStoryConcepts | GET | Staff queue read | Require curation staff permission; apply queue/assignment rules; do not treat Studio membership as staff access |
| updateStoryConceptCuration | POST | Curation write | Require curation permission and validate record/title/assignment; selected org if operation is intentionally Studio-scoped |

### StreamVista — src/lib/bridge/streamvista.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| createStreamVistaOrder | POST | Create order | Current model is owner_user_id scoped; if a Studio order is supported, add explicit organization binding only after the order schema and product contract are verified |
| listStreamVistaOrders | GET | Read/list | Currently user-owned order list; no cross-Studio access. Studio-wide visibility requires a separately approved organization ownership model |
| requestStreamVistaUpload | POST | Signed upload URL | Current check is order owner_user_id. If Studio orders are enabled, require explicit selected org and revalidate order/title relationship before signing |
| confirmStreamVistaUpload | POST | Storage verify + DB write | Revalidate order ownership, upload key prefix/session and any future Studio org binding |
| handoffStreamVistaOrder | POST | Workflow write | Revalidate order owner and job/state; any Studio operation must bind to selected org and exact title assignment |

### Payments — src/lib/bridge/payments.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| getCheckoutConfig | GET | Payment config read | Buyer/user context; no Studio membership inference |
| createLicenseOrder | POST | Payment order create | Validate title visibility, buyer identity, price and entitlement; Studio title owner org remains a separate title-scope check |
| verifyLicensePayment | POST | Payment verification | Verify provider signature/order linkage and immutable title/payment mapping; never trust selected org as proof of payment |
| listOwnEntitlements | GET | Entitlement read | Restrict to authenticated user’s entitlements; no Studio cross-tenant listing |

### Profiles and identity — src/lib/bridge/profiles.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| syncSupabaseSessionUser | POST | Identity link | Bind authenticated Supabase identity to Bridge identity; no client-supplied organization authorization |
| completeOnboarding | POST | Profile/org creation | Existing Studio bootstrap creates initial owner membership; this is not a multi-member approval workflow and must not be repurposed as one |
| requestEmailVerification | POST | Identity verification | User identity only |
| confirmEmailVerification | POST | Identity verification | Verify token/user binding; no organization authorization |
| listAdminProfiles | GET | Admin-sensitive read | Explicit admin permission; protect organization and personal data |
| inviteInternalRole | POST | Staff role mutation | Explicit admin permission, role allowlist and audit; not a Studio membership invite/approval API |

### Admin and operations

| Module / function | Method | Class | Studio context / control |
|---|---:|---|---|
| admin-workstations.ts — listAdminWorkstations | GET | Staff workstation read | Staff permission and assigned work scope; DIT assignment is a separate exact predicate |
| admin-workstations.ts — reviewAdminTitle | POST | Staff workflow write | Exact QC/Legal/Admin permission plus title scope; no implied Studio membership |
| admin-workstations.ts — setBuyerPublicationGate | POST | Buyer visibility write | Explicit publication-gate permission and title/rights validation |
| commercial-admin.ts — configureServiceRate | POST | Commercial configuration write | Admin permission; global commercial configuration, not Studio tenant mutation |
| commercial-admin.ts — configureTaxRate | POST | Commercial configuration write | Admin permission; global commercial configuration |
| commercial-admin.ts — configureSettlementRule | POST | Finance/admin configuration write | Explicit finance/admin permission and audit |
| duplicate-reconciliation.ts — listDuplicateReviews | GET | Sensitive review read | Staff review permission; title-level tenant scope required for any Studio-origin record |
| duplicate-reconciliation.ts — openDuplicateReview | POST | Review write | Staff permission and exact candidate/canonical title checks |
| duplicate-reconciliation.ts — decideDuplicateReview | POST | High-impact title merge decision | Strong staff permission, immutable audit, same-tenant validation for Studio titles; require separate review before execution |
| deliveries.ts — listDeliveryTraces | GET | Delivery trace read | Delivery permission; trace-to-title/asset scope must be enforced, selected org for Studio title |
| dmca.ts — registerDmcaAccount | POST | Rights-holder identity write | Authenticated claimant identity and ownership/evidence checks; not a Studio membership grant |
| site-content.ts — getPublicSiteContent | GET | Public read | Public path; no Studio context |
| site-content.ts — updateHomepageContent | POST | Admin content write | Explicit site-content admin permission; no Studio context unless a future tenant-specific content model is approved |
| submissions.ts — createRightsReadySubmission | POST | Submission write | Require title owner or explicit Studio context for Studio title; validate all submitted rights evidence |
| session.ts — getBridgeSession | GET | Session/profile read | Returns server-resolved identity and memberships; must not be treated as selected-org authorization proof |
| session.ts — getDashboardSession | GET | Admin dashboard read | Existing verified super-admin gate; keep separate from Studio membership |
| session.ts — getBridgePublicStatus | GET | Public status read | Public read only |


### Duplicate title merge — src/lib/bridge/duplicate-title-merge.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| previewDuplicateTitleMerge | POST | Sensitive title/rights preview | Require staff review permission; when either title is Studio-owned, validate both tenant scopes and prevent cross-Studio merges |
| mergeDuplicateTitle | POST | High-impact title merge write | Strong merge permission, transactional re-check, same-tenant/rights/buyer/asset/delivery invariants and immutable audit; no merge based only on caller-provided IDs |
| rollbackDuplicateTitleMerge | POST | High-impact rollback write | Strong rollback permission; load merge audit and both titles, verify tenant and pre-merge state before rollback |

### Service revenue — src/lib/bridge/service-revenue.ts

| Function | Method | Class | Studio context / control |
|---|---:|---|---|
| createServiceQuote | POST | Quote creation | Require service.quote_create plus title-level permission; selected org and fresh membership for Studio title |
| acceptServiceQuote | POST | Order creation | Revalidate quote owner, title and selected org for Studio title inside transaction |
| createServicePaymentOrderFn | POST | Payment order | Revalidate authenticated order owner and title/org scope before creating provider order |
| verifyServicePayment | POST | Payment verification | Verify provider signature and order-to-actor binding; payment proof does not establish Studio membership |
| recordServiceActualCost | POST | Finance write | Finance permission plus order/title scope; selected org for Studio title and idempotent audit |
| getCommercialFinancialSummary | GET | Global financial read | Finance permission; aggregate ledger is cross-tenant sensitive and must remain restricted to explicitly authorized finance roles |

## Loop consumer server functions — separate from Studio context

These endpoints do not receive Studio organization context merely because their catalog title originated in Bridge. They require consumer identity, profile ownership, publication authorization and payment/entitlement checks appropriate to the action.

### Loop profiles and watch activity — src/lib/loop/profile.ts

| Function | Method | Class | Required control |
|---|---:|---|---|
| getConsumerProfiles | GET | Consumer profile read | Authenticated user owns all returned profiles; automatic primary profile creation is a write side effect and needs idempotency |
| setActiveConsumerProfile | POST | Profile state write | Verify profileId belongs to authenticated user before changing active flags; current two-step updates should be atomic |
| createConsumerProfile | POST | Profile create | Bind new profile to authenticated user; review default PIN and avatar validation/security |
| saveWatchProgress | POST | Playback progress write | Authenticated user scope; validate loop title and sane position/duration bounds |
| getWatchProgress | GET | Playback progress read | Restrict to authenticated user's row |
| toggleWatchlist | POST | Watchlist write | Restrict mutation to authenticated user's watchlist and published/eligible title |
| isTitleInWatchlist | GET | Watchlist read | Restrict to authenticated user's watchlist |
| getConsumerWatchlist | GET | Watchlist read | Restrict list to authenticated user's rows and currently available titles |

### Loop subscriptions and TVOD — src/lib/loop/subscriptions.ts

| Function | Method | Class | Required control |
|---|---:|---|---|
| getConsumerSubscription | GET | Subscription read | Authenticated user's active subscription only |
| subscribeToLoopPass | POST | Paid entitlement write | Must be gated by verified payment capture/provider evidence; current source inserts an active subscription directly and requires a separate payment-flow review before certification |
| rentTvodMovie | POST | TVOD entitlement write | Must be gated by successful payment and idempotent order/entitlement mapping; current source inserts a 48-hour entitlement directly and requires a separate payment-flow review before certification |

### Loop catalog and playback entitlement — src/lib/loop/catalog.ts

| Function | Method | Class | Required control |
|---|---:|---|---|
| getLoopCatalog | GET | Public catalog read | Return only published titles with authorized Bridge publication and active distribution window; no private asset keys |
| getLoopTitleDetails | GET | Public title read | Same publication, published and approved status checks; ensure publication window is currently active |
| checkPlaybackEntitlement | GET | Consumer entitlement read | Authenticated user subscription/TVOD entitlement; validate active publication and title availability before returning canPlay |


## Current source findings that affect the design

1. `session.ts` loads active memberships and active organizations from the database, but currently exposes the collection as `organizationIds`. It sets legacy `organizationId` only when exactly one membership exists. This is safer than choosing the first membership, but it is not an explicit per-request selected-organization contract.
2. `titles.ts` list logic currently accepts an array of actor organization IDs for Studio title listing. That can expose a union across memberships rather than a user-selected organization workspace. Replace only after UI/request context and every consumer are traced.
3. `story-concept-api.ts` creation accepts `organizationId` and checks it against session-loaded `organizationIds`; listMyStoryConcepts unions all actor organization IDs. This needs fresh database validation and selected-org scoping.
4. `assets.ts` upload/download paths call title-level RBAC, but no explicit selected organization is carried through these endpoints. Multipart helpers re-open the asset and title; their context contract must be updated consistently.
5. `streamvista.ts` uses user-owned orders. Do not silently broaden order visibility to all members of a Studio; the schema and intended Studio order ownership model must be confirmed first.
6. `profiles.ts` bootstraps an initial Studio owner membership as active. The reviewed endpoint list does not establish a distinct invited-member approval/suspension/revocation workflow. Do not invent one or mark it implemented.
7. `dit-assignment.ts` is a separate helper/test area, not a substitute for a server-side assignment check in every DIT operation. The exact assignment must bind user + production + title + asset and be revalidated at the operation boundary.
8. Existing helper `organization-context.ts` is pure and tested at source level, but is not wired into request handlers. It does not itself enforce runtime authorization.
9. `duplicate-title-merge.ts` exposes three high-impact merge/rollback endpoints; both canonical and retiring title tenant ownership must be revalidated transactionally.
10. `service-revenue.ts` exposes six finance/service endpoints. The aggregate financial summary is cross-tenant sensitive and must remain restricted to explicit finance roles; Studio quote/order operations need title organization scope.
11. Loop consumer endpoints are a separate security boundary. In particular, `subscribeToLoopPass` and `rentTvodMovie` currently write active subscription/TVOD entitlements in their server handlers without an evident provider payment verification in those handlers. Treat this as a distinct payment-gate finding; do not certify paid access until the full payment flow is reconciled.

## Required implementation sequence — all remain gated

| Gate | Required evidence | Status |
|---|---|---|
| 1. Repository-wide endpoint inventory | AST scan of all `createServerFn` and server action exports, imports/call sites, route loaders/actions, storage URL issuers | BLOCKED / PARTIAL |
| 2. Ownership model | Confirm schema fields and invariants for Studio titles, assets, orders, productions, memberships, staff assignments | NOT VERIFIED |
| 3. Request contract | Define selectedOrganizationId input/context and validate it server-side; no client cache as authority | NOT IMPLEMENTED |
| 4. Per-operation guard | Revalidate membership + organization + resource parent relationship before each read/write/storage capability | NOT IMPLEMENTED |
| 5. Negative tests | Studio A cannot read/write/list/sign/commit/download Studio B resources; stale membership denied | NOT VERIFIED |
| 6. Membership lifecycle | Approved invite, pending invite, accept/approve, suspend, revoke, rejoin and audit paths tied to actual persistence model | NOT VERIFIED |
| 7. DIT | Exact user + production + title + asset assignment positive/negative tests | NOT VERIFIED |
| 8. Role matrix | Creator, Studio, Buyer, Investor, Admin, QC, Legal, Finance and DIT non-escalation tests | NOT VERIFIED |
| 9. Exact-head CI | Full test, typecheck, lint, build, PostgreSQL checks on the exact Draft HEAD | NOT VERIFIED |
| 10. STAGING DB verification | Only after separately authorized; table-specific policy/grant plan, no blanket changes | NOT AUTHORIZED |
| 11. Production | Separate approval and independent certification required | HOLD / NO-GO |

## Mandatory negative test matrix

- Studio A member requests Studio B title with selectedOrganizationId=A: deny.
- Studio A member requests Studio B title with selectedOrganizationId=B but no active B membership: deny.
- User has active A and B memberships, omits selectedOrganizationId: deny for Studio-scoped operation; never choose first.
- User's membership changes to invited/suspended/removed between page load and mutation: deny.
- Organization changes to suspended/closed between page load and mutation: deny.
- Studio A asset ID paired with Studio B title ID, or vice versa: deny.
- Client supplies an arbitrary object key, foreign part URL, upload ID, download key or storage path: deny.
- Signed upload URL request followed by membership revocation: subsequent multipart/confirm operation denied; previously issued URL expires within existing bounded lifetime.
- Buyer cannot read master/technical/censor-only assets absent explicit entitlement/policy.
- Investor cannot access a title without exact investor assignment.
- Creator cannot mutate a Studio title solely by knowing its ID.
- Admin/QC/Legal/Finance role cannot impersonate a Studio member or gain DIT assignment from generic staff role.
- DIT assigned to another asset, title, production or user: deny.
- A membership invite is not active until the actual approval/acceptance transition is persisted and audited.


## Route/component caller map — verified source references

The following caller relationships were checked at the inventory ref. This is a source import/call-site map, not a full dynamic call graph.

| Caller | Server-function calls observed | Context implication |
|---|---|---|
| `src/routes/title.$id.tsx` | `getTitle`, `updateTitle`, `listTitleAssets`, `requestAssetUpload`, `beginAssetMultipart`, `commitAssetMultipart`, `confirmAssetUpload`, `requestAssetDownload`, `abortAssetMultipart`, `getLoopPublication` | Highest-priority Studio resource boundary. Route currently passes titleId/assetId, but no selectedOrganizationId in the observed calls. UI state must carry explicit selected org before server guard rollout. |
| `src/components/bridge/asset-preview-gallery.tsx` | `requestAssetDownload` | Download URL issuance also occurs outside the title route; guard must be server-side and cannot rely on route-level gate. |
| `src/components/bridge/workflow-desk.tsx` | `getTitleWorkflow`, `getTitleRevenue`, `getLoopPublication`, `reviewTitleWorkflow`, `authorizeLoopPublication`, `suspendLoopPublication`, `revokeLoopPublication`, `advanceTitle` | Rights/QC/Finance/publication mutations are called from a shared desk. Keep staff permission and Studio owner context as separate branches. |
| `src/components/bridge/multilingual-rights-panel.tsx` | `listLanguageRights`, `listLicensePackages`, `createLanguageRight`, `createLicensePackage`, `authorizeLanguagePackage`, `createLicenseOrder`, `verifyLicensePayment` | Title-scoped rights/package calls currently pass titleId/packageId only. Payment verification remains separate from Studio membership. |
| `src/components/bridge/story-concept-form.tsx` | `createStoryConceptSubmission` | Creation caller; explicit organization choice must be passed for Studio-owned submissions and freshly revalidated. |
| `src/components/bridge/my-story-concepts.tsx` | `listMyStoryConcepts` | Current caller passes no selected org; avoid silently returning the union of all Studio organizations. |
| `src/components/bridge/story-concept-desk.tsx` | `listPendingStoryConcepts`, `updateStoryConceptCuration` | Staff curation queue; enforce exact curation permission and assignment, not Studio membership. |
| `src/components/bridge/streamvista-orders.tsx` | `createStreamVistaOrder`, `listStreamVistaOrders` | Current UI exposes user-owned service orders. Do not broaden to all Studio members without a confirmed organization-order ownership schema. |
| `src/routes/admin/workstations.tsx` | `listAdminWorkstations`, `reviewAdminTitle`, `setBuyerPublicationGate`, duplicate review list/open/decide functions | Staff-only workstation and duplicate-review paths; exact role and title scope are mandatory. |
| `src/routes/submit-film.tsx` | `createRightsReadySubmission` | Submission write; owner and Studio scope must be resolved server-side. |
| `src/routes/buyer.tsx` | `listTitles`, payment/entitlement functions | Buyer route invokes listTitles without selectedOrganizationId. Preserve buyer visibility and entitlement filtering; do not force a Studio selection on Buyer. |
| `src/routes/investor.tsx` | `listTitles` plus investor assignment query | Investor access is assignment-based; no Studio membership implied. |
| `src/routes/deliveries.tsx` | `listTitles` | Delivery list uses the shared title list; ensure the list is constrained by exact delivery permission and selected Studio when the actor is a Studio operator. |
| `src/routes/dashboard.tsx` | `getDashboardSession`, `listTitles` | Dashboard title list needs role-specific scope; admin dashboard access remains separate from Studio selection. |
| `src/components/bridge/gate.tsx`, `src/lib/auth/route-guard.ts` | `getBridgeSession`, `requestEmailVerification` | Session is a UI/route gate and not a per-resource authorization decision. |

### Caller gaps and non-observed functions

- No route/component caller was established in this pass for every exported endpoint in the inventory. Some endpoints may be used indirectly, through other components, server-only workflows, tests, or currently unreachable UI.
- `requestStreamVistaUpload` and `confirmStreamVistaUpload` were not observed in the inspected `streamvista-orders.tsx` caller. Their call sites remain NOT VERIFIED.
- DIT assignment helper `dit-assignment.ts` was not observed as a direct route import in the inspected DIT-related route set. A repository-wide search of all DIT consumers and server-side enforcement points remains mandatory.
- `getBridgeSession` returns the actor/membership collection for UI routing. It must not be used as a substitute for fresh per-request membership revalidation.
- The same server function may have callers not listed above. Do not infer absence of use from this partial map.

## Revised completeness assessment

- Source tree: recursive Git tree at ref `94d3fb6359f9103e62ed764b84b2f381ee9cd309` reported 201 TypeScript/TSX files in the repository and 130 under Bridge/Loop/routes. The tree response was not truncated.
- Focused call-site review: 10 route/component files plus 10 additional Bridge components/guards inspected.
- Repository-wide AST scan: NOT RUN. The available code-search results do not prove full endpoint enumeration.
- Complete import graph and indirect callers: NOT VERIFIED.
- The earlier endpoint count is a provisional inventory count, not a certified repository-wide total. Do not use it as an exhaustive endpoint count until AST enumeration and call-site reconciliation complete.

## Next safe gate

1. Run a deterministic TypeScript AST scan in the repository checkout for every `createServerFn`, `createFileRoute({ server: ... })`, API route handler, exported server action and storage signer.
2. Resolve imports and call sites for each endpoint; identify dead/unreferenced endpoints separately from reachable endpoints.
3. For each endpoint, record method, input schema, auth middleware, trusted identity source, DB reads/writes, object-storage actions, role checks, title/asset/order parent chain, and UI callers.
4. Only then draft a compatibility-preserving selectedOrganizationId request contract and tests. Do not wire a global mandatory Studio context into Buyer/Investor/Creator/Admin/QC/Legal/Finance or DIT paths.
5. Keep all DB and Production gates unchanged.


## Certification statement

The inventory and design contract are a planning artifact only. They do not prove runtime isolation, membership workflow completeness, DIT enforcement, RLS safety, or end-to-end behavior. The application remains BLOCKED — NOT CERTIFIED for this scope. Production remains HOLD / NOT CERTIFIED / NO-GO.


## Follow-up gate evidence — endpoint patterns, lifecycle, DIT and payment

Inspection ref: `20e0bae4fe00b57361130582c59d7195ed6a43d0`. This section records source observations from focused file reads and GitHub code-search results. It is not a substitute for a local TypeScript compiler/AST traversal.

### Server-entrypoint search results (discovery only)

| Search expression | Returned matches | Interpretation |
|---|---:|---|
| `createServerFn` | 28 matching files/results | Includes implementation files, tests and server-only helpers; not an endpoint count |
| `createFileRoute` | 34 matching files/results | Includes UI routes and API route files |
| `server: {` | 5 matching files/results | Includes Vite config and API route handlers |
| `createServerAction` | 0 | No exact match surfaced |
| `createAPIFileRoute` | 0 | No exact match surfaced |
| `export async function` | 66 matching files/results | Includes ordinary helpers, route handlers and server functions; not all are public endpoints |

GitHub code search is a discovery aid and has result limits/indexing semantics. It does not provide a complete parsed syntax tree, import graph or proof that every endpoint was found. The repository-wide AST gate therefore remains BLOCKED until a full repository checkout or archive can be scanned deterministically.

### Focused endpoint/input/identity/permission/DB/storage matrix

| Endpoint group / source | Input contract observed | Identity / permission observed | DB and storage effects | Gate result |
|---|---|---|---|---|
| `titles.ts`: create/list/get/update/advance | Zod schemas; create accepts optional `organizationId`; get/update use title ID | `authMiddleware`; create checks session organizationIds; list uses actor account type and role branches | Reads/writes `bridge_titles`, events, rights-related rows; title ownership includes `owner_organization_id` | Explicit selected organization is not consistently present; listing can union all active organization IDs |
| `assets.ts`: upload/multipart/confirm/download/list | Zod schemas; assetId/titleId, partBaseUrl, expected size | `authMiddleware`; title-level `canOperateOnTitle` checks | Reads/writes `bridge_assets` and title/upload state; OCI signed upload/download, multipart, object verification/sealing | Studio selected-org binding not carried through all observed calls; signed URL revalidation required |
| `workflow.ts`: submit/review/get/revenue/settlement | Zod titleId/review/evidence schemas | `authMiddleware`; workflow role/permission checks | Title workflow, rights, revenue/payment-event reads and settlement evidence writes | Separate Studio owner context and internal staff permission required |
| `loop-publication.ts`: readiness/authorize/suspend/revoke/window/get | Zod bridgeTitleId and publication inputs | `authMiddleware`; publication/rights preflight | Reads rights/title; writes publication and authorization state | Studio title ownership and exact selected organization must be rechecked for Studio-origin operations |
| `payments.ts`: checkout/order/verify/entitlements/webhook | Zod order/payment inputs; webhook raw body + signature | Auth middleware for buyer functions; payment signature and provider fetch; webhook signature | Writes payment/webhook/entitlement/title state | Bridge payment path includes provider verification; keep distinct from Loop subscription path |
| `profiles.ts`: onboarding, verification, admin profiles, internal invite | Onboarding Zod fields; email/role invite schema | Auth middleware on most operations; confirmation token is separate | Creates/updates profile and Studio organization/membership; audit writes | No Studio member invite/accept/suspend/revoke lifecycle API was established in this module |
| `streamvista.ts`: orders/upload/confirm/handoff | Zod service/lane/order/key/title inputs | Auth middleware; order lookup binds `owner_user_id` to actor; handoff checks approved order and same-owner title | Writes orders/jobs; OCI signed upload and object verification | Preserve user-owned scope; do not silently broaden to Studio-wide |
| `loop/subscriptions.ts`: subscription/rent | Plan enum; Loop title ID | Auth middleware; user identity from context | Inserts active subscription and TVOD entitlement records | Provider-payment verification is not visible in these handlers before active entitlement insert; BLOCKED pending complete payment-flow reconciliation |
| `loop/catalog.ts`, `loop/profile.ts` | Server-function validators and profile/catalog inputs | Auth middleware on inspected consumer operations | Catalog/profile DB reads/writes | Full publication/entitlement/storage relationship mapping still required |
| `api/razorpay/webhook.ts` | HTTP request body + `x-razorpay-signature` | Delegates signature validation and event ingestion to payments module | Webhook event/payment/entitlement persistence | API route must be included in AST inventory, not just createServerFn exports |

The table is deliberately grouped. It does not claim to enumerate every function in every module.

### Membership lifecycle — source-backed result

- `profiles.ts` exports `syncSupabaseSessionUser`, `completeOnboarding`, `requestEmailVerification`, `confirmEmailVerification`, `listAdminProfiles`, and `inviteInternalRole`.
- `completeOnboarding` creates a Studio organization and an `owner` membership with `status='active'` for a new Studio identity. On conflict, it restores the same membership to active.
- `inviteInternalRole` is an internal staff-role invitation; it is not evidence of a Studio member invitation/acceptance workflow.
- No inspected server endpoint implemented the full Studio member lifecycle: invite → accept → approve → suspend → revoke → rejoin, with actor authorization and audit history.
- `session.ts` re-reads active membership and active organization for session construction. That is useful for navigation, but it does not establish the required fresh selected-organization check in every resource handler.
- Migration `0021_bridge_organizations.sql` defines membership statuses `invited`, `active`, `suspended`, `removed`, and organization statuses `active`, `suspended`, `closed`. It also creates `bridge_organization_memberships_one_active_org_per_user`, a partial unique index on `user_id` for active rows.
- **Compatibility blocker:** that unique index limits a user to one active Studio organization. This conflicts with the desired multi-Studio membership model unless the product requirement is changed. Do not silently change or apply this migration; reconcile schema design and existing STAGING drift first.

### DIT exact assignment — source-backed result

- `dit-assignment.ts` is a pure helper. It checks exact `assignedUserId + productionId + titleId + assetId` and requires `status='active'`.
- Existing `dit-assignment.test.ts` covers wrong user, production, title, asset, broad-scope escalation, pending/suspended/revoked status and missing identity/scope.
- This is useful unit-test evidence only. The helper was not shown wired into all sensitive server handlers, and no authoritative persisted assignment table / CRUD lifecycle was established in the inspected sources.
- DIT negative tests therefore remain **PARTIAL**: helper logic PASS; persisted server authorization NOT VERIFIED.

### Studio A/B and membership revocation tests — evidence boundary

- Existing `organization-context.test.ts` covers explicit A/B selection, missing/blank selection, foreign user, invited/suspended/removed membership, inactive organization, and invalidation after suspension/removal/closure.
- These tests operate on supplied in-memory membership records. They do not prove that handlers re-read the database on every request, that Studio A cannot fetch Studio B's title/asset by guessed IDs, or that an already issued signed URL is revoked.
- No database-backed negative test was found in the inspected test files for cross-tenant read/write, stale session after revocation, multipart continuation after revocation, or signed URL issuance after revocation.
- Therefore: helper unit tests PASS; end-to-end authorization tests NOT VERIFIED.

### Payment path separation — critical review item

- Bridge `payments.ts` contains provider payment retrieval/signature verification and webhook signature processing before captured-payment entitlement logic.
- Loop `subscriptions.ts` directly inserts active subscription and TVOD entitlement rows in the inspected handlers. No Razorpay provider order/payment/signature verification is visible in those functions.
- Do not conclude paid Loop access is secure based only on Bridge payment verification. Reconcile Loop checkout creation, provider callbacks/webhooks, payment-event tables and entitlement creation as one end-to-end flow before certifying TVOD/SVOD.

### Runtime guard decision

**DO NOT IMPLEMENT YET.** The following blockers are open:
1. Deterministic repository-wide AST scan and complete import/caller graph unavailable from current code-search-only inspection.
2. Multi-Studio requirement conflicts with migration 0021's one-active-organization-per-user index.
3. Studio membership lifecycle persistence and authorization endpoints are not established.
4. DIT helper is not proven to be wired into all DIT server operations or backed by persisted assignment records.
5. Studio A/B and revocation tests are helper-only, not DB-backed negative tests.
6. Loop payment-to-entitlement chain is not reconciled.
7. Exact-head CI and database-backed STAGING tests are not verified.

No runtime code, database schema, policies, grants, migration history, secrets, deployment, merge or Production state was changed by this review.
