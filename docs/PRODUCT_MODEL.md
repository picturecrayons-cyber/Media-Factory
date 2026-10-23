# Crayons Bridge — Confirmed Product Model

**Status:** Product/business architecture baseline locked on 2026-10-23.  
**Owner:** StreamVista OPC Pvt Ltd / Crayons Pictures.  
**Production posture:** HOLD / NOT CERTIFIED until every release gate in this document has evidence.

## 1. Product boundary

Crayons Bridge is a **private media supply-chain, rights, licensing and distribution control plane**. It is not a public streaming service. Crayons Loop is the first integrated partner and the consumer streaming product. Future partner adapters may serve OTT, television and other licensed distributors; the core domain model must not be Loop-only.

**Bridge authorizes → partner-specific adapter delivers → partner serves.**

The presence of a title, metadata, artwork or uploaded file in Bridge is never publication permission. No upload-triggered publishing, no public catalog by default, and no partner may enumerate internal Bridge records.

## 2. Canonical workflow and hard gates

1. **Intake / parked submission** — creator/studio submits title metadata and assets; submission remains private.
2. **Storage verification** — private-object existence, expected byte size, media type, checksum/ETag and version association verified server-side.
3. **Curation / QC** — required assets and technical QC are reviewed; findings and corrections are versioned.
4. **Rights / legal** — ownership evidence, chain of title, permitted media, territories, languages, exclusivity, start/end windows and restrictions are reviewed.
5. **Commercial terms** — partner contract, business model (TVOD/SVOD/AVOD/other), pricing/currency, revenue shares, fees, tax/reporting and settlement terms are validated.
6. **Partner-specific package** — only the exact approved asset versions and minimum partner metadata are packaged to the target adapter's format/profile.
7. **Explicit authorization** — an authorized reviewer approves the immutable delivery scope (title/version, partner, territory, languages, media/model, price/terms and window). Approval is not inferred from upload, QC, a generic title status or another partner's approval.
8. **Delivery / acknowledgement** — idempotent delivery job records package version, attempt history, partner acknowledgement and errors.
9. **Partner availability / revenue reconciliation** — partner visibility follows confirmed authorization and delivery state. Revenue is reconciled from verified payment/sales/settlement evidence; estimates are never reported as settled revenue.
10. **Expiry / revocation / takedown** — prevent new delivery/access immediately, enqueue partner disable/takedown where supported, record acknowledgement, and retain the audit history.

Each gate has its own persisted state and evidence. UI badges must not collapse distinct states into “ready”.

## 3. Partner and rights model

One canonical title can have many independent deliveries. Every delivery scope includes at minimum:
- partner identity and active integration configuration;
- title and exact asset/package versions;
- territories, languages and permitted media/exploitation model;
- start/end window and exclusivity;
- contract/license and commercial terms;
- target package/profile, delivery status and partner acknowledgement;
- authorization actor/time, revocation/expiry state, immutable audit references.

No partner-specific right may be inferred from another partner's grant. Overlapping exclusivity or conflicting windows fail closed. A missing, ambiguous, expired, revoked or unverified right blocks delivery. The initial Loop adapter must implement the same generic contract as future adapters.

## 4. Confidentiality and authorization

- Default-deny for internal records and partner data; expose only the minimum authorized fields for that partner and delivery.
- Server-side authorization is authoritative. UI route guards and client-side filtering are not security boundaries.
- Enforce tenant/partner scope at the server and database layers (RLS or equivalent policies), with negative cross-partner and cross-role tests.
- Keep masters, contracts, legal evidence, source metadata, pricing and signed URLs private. Never place secrets or signed URLs in logs, audit metadata, UI errors or email.
- Use private object storage, short-lived scoped media access, versioned checksums, least-privilege service identities and origin-specific CORS.
- Separate human roles and duties: submitter/creator, studio owner, QC reviewer, legal/rights reviewer, licensing/commercial operator, delivery operator, finance/reconciliation, partner service identity, admin and super-admin. Use least privilege and separation of duties; prohibit self-approval where required.
- Audit all sensitive reads/exports, approvals, role/contract changes, delivery attempts, revocations, financial evidence and administrative actions. Make audit events append-only to normal app roles.
- Use idempotency keys, transactional outbox/job patterns, retry-safe transitions, bounded retries, dead-letter/error review and operator-visible recovery. No “success” until the downstream state is verified.

## 5. User-facing apps and workspaces

- **Creator/studio workspace:** private intake, draft save, resumable upload, verification status, correction requests, version history and submission tracking. Never expose internal reviewer notes or other studios' records.
- **Bridge Command Center:** task-based queue for parked submissions, storage verification, QC, rights/legal, licensing, authorization, delivery exceptions, partner acknowledgements, expiring rights and audit review.
- **Partner management:** partner contracts, credentials/health (secrets never displayed), allowed formats, territory/model rules, mapping and delivery history; partner users only see their own scoped records.
- **Finance/reconciliation:** authorized commercial terms, partner statements, payment events, refunds/chargebacks and settlement evidence; distinguish gross, fees, share, payable and actually settled values.
- **Loop consumer app:** public catalog and playback only for active Loop-authorized, licensed, in-window and successfully delivered titles; purchase entitlement is created only after verified/captured payment and server-side checks.
- **Super-admin/security workspace:** user/role lifecycle, integration health, policy/audit review and break-glass controls with explicit reason and audit. Super-admin does not bypass rights or publication gates.

All dashboards should be responsive, accessible, understandable to non-technical users, with clear next actions, saved state, empty/error/loading states, and honest progress. Notifications are persisted and deduplicated; email is reserved for meaningful events (submission received, verification failure/pass, correction required, review required, delivery failure/ready, revocation/expiry, payment/reconciliation events). Notifications never imply approval unless approval is recorded.

## 6. Revenue model and financial integrity

Bridge must enable repeatable licensing operations: partner-specific licensing, rights-owner/distributor revenue splits, pricing by territory/window/model, delivery/contract tracking, TVOD/SVOD/AVOD-compatible terms, sales reports and reconciliation. Loop's current consumer model is TVOD with Razorpay. Payments require server-side order/signature/webhook verification, idempotent event handling and entitlement only after confirmed capture. Never switch live payment configuration or perform live charges during validation. Financial dashboards must distinguish recorded, estimated, reconciled and settled values.

## 7. Integration boundaries

- **Supabase/Postgres/Auth:** canonical identity, transactional domain data, policy enforcement and audit; no Preview-to-production database access.
- **Oracle OCI Object Storage (Mumbai):** production media backend; isolated non-production identity/bucket/origin for E2E. AWS S3 paths are legacy/test only.
- **Vercel:** Preview and production deployment evidence must match the exact Git SHA and intended environment.
- **Razorpay:** test mode for E2E; signature/webhook verification and idempotency before entitlements.
- **Hostinger Mail:** transactional notifications via server-side credentials; no sensitive media or signed URLs in mail.
- **GitHub / Linear:** source-of-truth implementation, review, acceptance criteria, release evidence and unresolved blockers.

## 8. Production launch gates (all required)

- Exact commit SHA has passing build, typecheck, lint, unit/integration/workflow tests, secret scan and migration checks.
- Authenticated browser tests cover every role and deny cross-tenant/partner access.
- Staging-only Supabase project and dedicated non-production OCI identity/bucket/origin are proven; no production data or credentials in Preview.
- Realistic synthetic end-to-end tests prove upload, verification, QC, rights/legal, license, explicit scope authorization, partner packaging, acknowledgement, expiry/revocation/takedown and retry/idempotency.
- Partner API contracts are verified; Loop catalog/playback/TVOD entitlements are checked end-to-end using test payment mode.
- Persistent notification/outbox/email flows are tested and deduplicated.
- Backup/restore, incident rollback, observability, retention, privacy/legal review, accessibility, performance and security review are recorded.
- Independent review approves the exact head; exact-SHA Preview is healthy and isolated; production deployment and post-deploy smoke evidence are recorded.

**A green CI run or Vercel “Ready” status alone is insufficient.** Do not merge, promote, mutate production data, change buyer visibility, retry real-title uploads or initiate live payments until the appropriate explicit authorization and evidence gates are complete.
