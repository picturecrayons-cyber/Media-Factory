# Crayons Bridge — Master Distribution & Super Admin Operating Model

**Status:** Implementation work in Draft/Preview only. **Production: HOLD / NOT CERTIFIED.**

## Product boundary

Crayons Bridge is the master-distribution control plane for global buyers. Discovery, prospect qualification, enquiries, communications, offers, negotiation, contracts, rights approval, delivery authorization, partner acknowledgements, revocation and audit history belong in Bridge. Crayons Loop is one downstream delivery/consumer partner; it does not define the architecture.

**Bridge authorizes → partner-specific adapter delivers → partner serves.**

## Rights rule: no sublicensing by default

- Every distribution delivery has `sublicensing_permitted = false` by default.
- No sublicensing right is implied by discovery, an enquiry, negotiation, a standard distribution deal, payment, package access, delivery, or a generic “global” designation.
- A sublicense exception must be a separate, explicit legal grant with the authorized actor/time, legal reference and a non-empty scope snapshot. The applicable rights/legal review and server-side authorization must validate the grant before any downstream transfer is enabled.
- Scope must identify the title and exact package/assets, the direct buyer/partner, downstream platform(s), territories, languages, exploitation model, window, exclusivity and other contractual limits.
- Missing, ambiguous, expired, revoked or conflicting rights fail closed. A delivery entitlement is not a sublicensing entitlement.
- UI copy and SQL constraints are defense in depth; server-side deal validation, API handlers, partner adapters, delivery manifests and audit events must enforce the same policy.

## Super Admin operating workspace

One workspace in the existing Vercel `bridge` project should coordinate:
1. Creator/studio submissions, correction requests, QC and legal workflow.
2. Global buyer prospects, verified buyer accounts and contracted partners as separate states.
3. Buyer discovery, enquiries, offers, negotiations, contracts and scoped communication history.
4. Hostinger Mail thread linking and draft preparation; no message sends without explicit human confirmation and an auditable outbox result.
5. Partner-specific authorization and delivery, with independent partner/territory/window/model scopes.
6. Razorpay test-mode payment/order reconciliation; payment alone never authorizes content delivery.
7. Persisted, deduplicated notifications tied to real state transitions.
8. Audit review for access changes, rights approvals, sends, payment events, deliveries, revocations and takedowns.

## Access and confidentiality

- Enforce roles, organization/tenant scope and partner scope on the server and at the database RLS boundary. Client-side hiding is not authorization.
- Super Admin has operational oversight, not a rights bypass. QC/legal separation-of-duties and title-level authorization remain mandatory.
- Do not expose another buyer's contracts, commercial terms, contact records, private assets, signed URLs or internal notes.
- Distinguish internal notes from external correspondence. Never send automatically from a background event.
- Store integration credentials only in server-side secret management. Never put secrets or signed media URLs in logs, emails or UI errors.

## Required implementation gates

- [ ] Schema/RLS review on staging only; migration is additive and is not applied by this change.
- [ ] Persisted buyer/prospect registry with deduplication and explicit pipeline state; prospects are not treated as verified accounts.
- [ ] Scoped communications inbox/thread links and audited, confirmed outbound mail.
- [ ] Server-side RBAC/tenant/partner enforcement with negative cross-tenant tests.
- [ ] Sublicensing denied-by-default tests across service, API, package/manifest and partner-adapter paths.
- [ ] Exact scope authorization and rights expiry/revocation/takedown tests.
- [ ] Razorpay test-mode verification and idempotent reconciliation; no live payment actions.
- [ ] Persisted notifications/outbox with deduplication and retry-safe transitions.
- [ ] Build, typecheck, tests, security/migration checks, independent review and exact-SHA Preview evidence.
- [ ] Prove Preview uses staging Supabase and non-production OCI credentials/bucket/origin before any E2E writes.

## Safety

This change does not merge or deploy, apply migrations, change production data or buyer visibility, send external email, run live Razorpay actions, or retry real-title uploads. **Production remains HOLD / NOT CERTIFIED** until every release gate is evidenced for the exact commit and deployment.
