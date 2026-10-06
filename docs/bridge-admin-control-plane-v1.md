# Crayons Bridge Admin / Super Admin Control Plane v1

## Canonical publication rule
A title is Buyer-visible only when ALL six production gates are satisfied:
1. Admin QC = PASSED
2. Legal = APPROVED
3. OTT Preparation = READY
4. Packaging = COMPLETE
5. Curation = APPROVED
6. Delivery = READY

Only after six-gate certification may the system expose the title as LIVE_FOR_BUYERS.
Missing, failed, expired, revoked, inconsistent, or unavailable evidence fails closed.

## Scope
Apply the same server-side rule to Buyer Catalog, Buyer Search, Buyer Recommendations, Buyer Licensing, and distribution publication.
Explicit buyer access grants never override publication readiness.

## Admin / Super Admin modules
- Command Center
- Title Intake & Lifecycle
- Metadata & Editorial
- Assets & Technical QC
- Legal & Rights
- OTT Preparation
- Packaging
- Curation
- Delivery Readiness
- Buyer Publication
- Buyer Access & Licensing
- Payments & Razorpay
- Orders & Entitlements
- Notifications / Hostinger Mail
- Audit & Compliance
- System Health / Integrations
- Settings / Roles / Permissions

## Architecture
Use one canonical readiness evaluator shared by Admin and every Buyer-facing access path.
Material changes to assets, QC, legal, rights, OTT preparation, packaging, curation, delivery authorization, or windows must invalidate or recompute readiness.
All mutations are server-side, RBAC-protected, and audited.

## Lifecycle
DRAFT -> UPLOADING -> PREPARING -> QC_REVIEW -> RIGHTS_REVIEW -> READINESS_PROCESSING -> DELIVERY_READY -> LIVE_FOR_BUYERS
LIVE_FOR_BUYERS -> IN_NEGOTIATION -> LICENSED -> DELIVERED
LIVE_FOR_BUYERS must never be a manual bypass.

## Admin UI
Every title workspace needs a six-gate rail, state, evidence, reviewer, timestamp, blocker, next action, re-review, certification history, publication state, and computed Buyer visibility.

## Release gates
Exact-head CI success; matching Vercel READY deployment; signed-in Admin/Super Admin E2E; signed-in Buyer negative/positive visibility proof; licensing block proof; audit proof; Supabase schema/advisor verification.
No mock/demo evidence counts as production proof.