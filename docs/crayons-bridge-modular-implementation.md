# Crayons Bridge modular implementation

**Status:** First access-control hardening change committed; remaining modules staged incrementally  
**Target:** non-production Preview only  
**Base audited:** `main` at `9c56a25e4eba2de63c4c261503112c8945b2dd5a`

## Guardrails

- Preserve existing server APIs and canonical Bridge title IDs.
- Do not treat organization-name equality as an authorization grant.
- Do not loosen title ownership, account permissions, internal roles, RLS, or buyer visibility.
- Do not mark uploads ready without confirmed storage verification.
- Keep QC approval and legal/rights approval independent.
- Keep production-service requests separate from title licensing, QC, distribution, and Loop publication.
- Do not merge or deploy from this branch; no production mutations are authorized.

## Six modules and existing implementation surfaces

| Module | Existing surfaces | Required acceptance |
|---|---|---|
| Title Management | `src/routes/studio.tsx`, `src/routes/workspace.tsx`, `src/components/bridge/title-desk.tsx`, `src/routes/title.$id.tsx`, `src/lib/bridge/titles.ts` | A title shown in a list must be openable by the same authorized actor; canonical title ID remains stable. |
| Asset Ingest & Storage | `src/lib/bridge/assets.ts`, `src/lib/bridge/asset-confirmation.ts`, `src/lib/bridge/ott-ingest-spec.ts`, `src/routes/title.$id.tsx` | Only verified storage objects can set verified master/artwork references; failure, timeout, and unknown outcomes fail closed and can be safely retried. |
| Rights & Licensing | `src/lib/bridge/workflow.ts`, `src/lib/bridge/workflow-policy.ts`, `src/lib/bridge/rights-coverage.ts`, `src/components/bridge/workflow-desk.tsx` | Expired/revoked grants, wrong territory/language/exploitation model, invalid windows, and invalid revenue splits cannot authorize publication. |
| QC & Deliveries | `src/routes/deliveries.tsx`, `src/routes/internal.tsx`, `src/routes/admin/workstations.tsx`, `src/lib/bridge/workflow.ts`, `src/lib/delivery/vendor-jobs.ts` | Delivery remains blocked until required persisted QC, rights, package, and human sign-off conditions pass. |
| Production Services | `src/components/bridge/streamvista-orders.tsx`, `src/lib/bridge/streamvista.ts` | Service request/source/QC/handoff remains separate from licensing, distribution, and Loop publication. |
| Users, Permissions & Audit | `src/lib/bridge/rbac.ts`, `src/lib/bridge/session.ts`, `src/lib/bridge/audit.ts`, `src/lib/bridge/rbac.test.ts` | Role boundaries, explicit grants, studio isolation, and audit events are enforced server-side. |

## First blocking finding: studio list/open mismatch

The studio title list in `src/lib/bridge/titles.ts` previously included records where the owner's `bridge_profiles.organization_name` matched the actor's organization name. The title detail endpoint uses `canReadTitle()`, which for a non-staff actor requires individual title ownership. That created a list/detail mismatch and could expose title metadata across unrelated accounts that reused an organization name.

**Implemented first fail-closed fix:** `listOwned()` now lists only records owned by the authenticated actor (and excludes merged titles when that schema column exists). Organization-name equality no longer affects authorization. Existing API shape and `getTitle`/mutation owner checks remain unchanged. This intentionally does not add studio collaboration. The correct future implementation needs an explicit, revocable server-side membership/ownership relation, a migration, checks in every relevant read/mutation/upload/workflow path, and negative cross-studio tests; do not infer authorization from profile strings.

## Implementation sequence

1. **Access model first — initial hardening committed:** removed implicit studio sharing based on organization-name equality. Next, design an explicit studio membership/ownership grant and migration; inventory all title read/update/asset/workflow/delivery endpoints; add cross-studio negative tests.
2. **Title Management:** verify list/detail/update semantics remain consistent; only add collaboration after the explicit membership model is implemented.
3. **Asset Ingest & Storage:** add end-to-end recovery/idempotency tests for verified success, rejection, timeout, and unknown outcome.
4. **Rights & Licensing:** strengthen server-boundary negative tests and retain independent QC/legal review.
5. **QC & Deliveries:** trace persisted delivery state and require sign-off; distinguish requests from completed deliverables.
6. **Production Services:** test order, source verification, QC and handoff without granting rights or publishing.
7. **Users, Permissions & Audit:** role-aware module navigation, least-privilege staff boundaries, and auditable access changes.
8. **Integration acceptance:** unit tests, typecheck, lint, CI and non-production Preview acceptance before review.

## Current validation status

- Source audit: performed through GitHub repository files/search.
- Unit tests/typecheck/lint: **not run** in this tool session; CI result still needs checking.
- Preview reproduction/acceptance: **not run**.
- Production changes/deployment: **none**.
- This document is an audit/implementation guardrail, not evidence that all six modules have been implemented.
