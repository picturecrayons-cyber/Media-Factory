# Crayons Bridge — Simple Connected Operations OS

Status: implementation specification, not a claim of deployed functionality.
Target: Testing/Preview first. Production promotion remains gated by exact-head CI, authenticated E2E evidence, review and explicit release approval.

## Product rule

Crayons Bridge is one connected operating system for title intake, QC, rights, licensing, distribution, delivery, revenue and operational oversight. Reuse the existing dashboards, routes, tables, permission checks, event/audit systems and integrations. Do not build parallel dashboards, duplicate workflows, new services, or new tables unless an audited gap proves they are essential.

The user experience must be simple: one clear next action, plain-language status, visible owner, due date where relevant, and a short activity history. Hide functions a role cannot use. Do not show disabled modules as clutter.

## Workspace model

- Creator: My Titles; upload main film and posters; required metadata; submit to QC; see status, reviewer requests and next action; maintain reusable private documents.
- Studio: Productions; team-owned submissions; shared assets and reusable private documents; organization-scoped activity and review status.
- Buyer/Licensing: Approved Catalogue; title details; licence enquiry/request; agreement status; licensed delivery and entitlements. Never show unapproved or held titles.
- QC reviewer: Assigned QC queue only; playback/screener access only when authorized; record pass/fail/needs-information, reason, evidence and audit event.
- Legal reviewer: Assigned rights queue only; verify chain of title, territory, term, media, exclusivity, restrictions and evidence; record clearance/hold/reject with reason.
- Finance: Assigned payment, settlement, reconciliation and revenue views only; no rights or QC approval powers.
- Admin: Operational queues and account support limited to granted permissions.
- Super Admin: Connected control centre across the system; user and organization administration, module health, queue visibility, exceptions, audit, integration health, commercial and revenue summaries. Existing server-side Super Admin authorization remains mandatory.

## Simple title lifecycle

1. Draft: create title and enter essential metadata.
2. Assets: upload main film/master and posters. Preserve originals, verify upload completion/checksum, and show clear per-asset status.
3. Submit for QC: validate required fields/assets, then create one idempotent submission and route to QC. Show "QC pending" until a reviewer records a decision.
4. QC: reviewer chooses Pass, Needs information, or Fail with reason and evidence. No automated pass.
5. Rights review: legal reviewer checks ownership and scope. QC pass does not imply rights clearance.
6. Commercial readiness: agreements, price/terms, territory and rights scope are verified.
7. Buyer publication: only an explicitly authorized release action can publish an approved title.
8. Licensing and delivery: buyer request/agreement/payment entitlement, then protected delivery/playback subject to validated scope.
9. Revenue: record gross, fees, taxes, shares, settlement, refunds and reconciliation using existing financial source-of-truth records.

State transitions must be server-side permission-checked, validated against the current state, transactional where multiple records change, idempotent, and audited. Never infer approval from an upload or a UI flag. Never skip legal, QC, payment, entitlement or release gates.

## RBAC and dashboard rules

Use the existing `src/lib/bridge/rbac.ts` permission registry as the source of truth. Do not add role-name checks scattered through UI code. Build visible navigation from a centralized capability map that references existing permission identifiers. Server routes and data functions must independently enforce the same permissions; hiding a menu item is not security.

Important existing behavior to preserve:
- Internal staff roles do not inherit Creator/Studio/Buyer account powers.
- Creator/Studio scope is owner- or verified-organization-membership-scoped.
- Buyer catalogue access is limited to buyer-visible title states.
- QC, Legal and Finance remain separate reviewer powers.
- Only verified Super Admin can enter the private owner control plane.
- All privileged actions write actor, timestamp, action, target, before/after state, reason and evidence reference to the existing audit system.

## Applications and low-cost agent assistance

Use existing application records and workflow state. Automate only repeatable low-risk work:
- intake completeness checks and missing-field detection;
- metadata normalization and duplicate detection suggestions;
- file format, checksum, poster-dimension and required-asset validation;
- routing to the correct assigned queue;
- reminders, status notifications and concise summaries;
- dashboard search, help and guided next-step suggestions.

Agents may prepare recommendations and drafts, never silently mutate regulated/business-critical decisions. A human with the appropriate RBAC permission must approve QC, rights, agreements, pricing exceptions, payments/refunds, publication, entitlement grants, delivery exceptions and takedowns. Any agent action must execute as the authenticated user/service identity with narrowly scoped permissions, idempotency, rate limits and a complete audit trail. Do not describe illustrative agent names as deployed runtimes. Do not introduce paid model dependencies or new infrastructure before a costed MVP proves value. Reuse existing connected providers and server functions.

## Communications and workflow visibility

Use the existing notification/event system for inward (received/submitted), outbound (requested/sent), forward (assigned/advanced) and backward (returned/needs information/reopened) updates. Every notification links to the existing record, identifies the next action and respects recipient authorization. Avoid duplicate inboxes and duplicate communications stores.

## Super Admin connected view

One compact dashboard with:
- Work queues: submissions, QC, rights, applications, licensing and delivery exceptions.
- Business: approved catalogue, buyer demand, deals and agreements.
- Revenue: captured payments, pending settlements, fees, refunds and reconciled net revenue.
- Network: users, organizations, studios, creators and buyers.
- Infrastructure: storage/ingest, processing, integrations, mail, payment/webhook and playback health.
- Governance: holds, expiries, audit events and access/security exceptions.

Each card drills into an existing filtered queue or detail page. Do not duplicate records or create parallel workflow engines. Metrics must come from reconciled source records and clearly state their time window; never fabricate totals or count pending orders as revenue.

## Implementation sequence

### A — Audit existing system
Map routes, navigation, permission identifiers, dashboard components, application/title schemas, events, audit, notifications, storage, QC, rights, licence, payment, entitlement and playback. Identify duplicates and gaps before edits.

### B — Consolidate UX
Refactor existing role dashboards into the workspace model above. Reuse routes and components. Keep the Creator/Studio "submit for QC" action visible only when existing server validation passes. Surface the current QC state and next action.

### C — Workflow consistency
Ensure submission, reviewer decisions, rights clearance, commercial readiness, publication, entitlement and delivery use the existing authoritative state model, transactional writes and audit trail. No new status enum until existing schema and migration history are checked.

### D — Low-risk automation
Expose only automations backed by registered integrations and permissions. Add dry-run and manual confirmation for external side effects. No agent gets a global service credential or broad Super Admin permissions.

### E — Verification
Run exact-head typecheck, lint, unit/integration tests, build, secret scan and migration replay on Testing. Run authenticated E2E with separate Creator, Studio, QC, Legal, Buyer and Super Admin accounts. Include negative permission tests and two-account isolation. Verify upload checksum, poster retention, QC queue, return-for-changes, rights hold/clearance, Buyer visibility, entitlement and protected delivery. Do not publish to Production during Preview certification.

### F — Production release
Only after gates A–E pass, human review approves the diff, required secrets are securely configured, deployment is READY, and the owner separately authorizes promotion. Preserve main as the only Production release source. No direct Preview-to-Production credential reuse.

## Acceptance criteria

- A Creator can upload the main film and posters, retain those assets, submit exactly once for QC, and see an explicit pending status.
- A Creator cannot mark QC passed, clear rights, publish, grant an entitlement, or release content.
- A QC reviewer can only access assigned/authorized QC items and can record a reasoned decision.
- Legal and Finance powers remain distinct.
- Buyer sees only published/licensable titles.
- Super Admin sees the connected operations picture without duplicating underlying modules.
- Cross-account data access is denied and verified by negative tests.
- Users see only relevant actions, plain-language status and one clear next step.
- Agents only perform authorized, low-risk assistance and leave auditable evidence.
- No Production changes occur before separate release approval.
