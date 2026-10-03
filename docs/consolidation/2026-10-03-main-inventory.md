# Bridge main consolidation inventory — 2026-10-03

Base: `main@6ea0e7bc1ec628e2a2b576c1d26270f85e038855`

Production HOLD. This branch is consolidation-only. Do not mix behavior-changing auth, rights, storage, entitlement, migration-history, or deployment work into this pass.

## Retain until proven otherwise

- `src/lib/auth/gate-identity.server.ts` — still has direct test coverage via `gate-identity.test.ts`; not safe to delete from evidence available on current main.
- `src/lib/preview-embedder-origin.ts` — imported by `src/lib/preview-host-bridge.ts`; not dead by static evidence.
- `src/lib/app-data/client.server.ts` and server-only guard — internally referenced and still part of connector/runtime scaffolding.
- PGLite support — current `package.json`, `src/lib/db.ts`, migrations, Vite setup and tests still reference it. Removal would be behavior-changing and requires a dedicated verified migration.
- `migrations/0002_cinema.sql` — do not modify or remove until production migration-history/data provenance is independently reconciled.

## Reconcile separately

- PR #91 canonical-origin reconciliation is mergeable and based on current main, but it is still behavior-changing auth/origin work; keep out of cleanup.
- PR #79 RBAC repair, #77 onboarding conflict handling, #55/#57 rights/publication changes, #54 AWS storage are focused behavior PRs and must remain separate.
- PRs #59/#66 are visual/brand changes and not cleanup.

## Cleanup candidates for this branch

Only make changes after exact import/reference confirmation:
- stale comments/docs that describe retired auth provider behavior but do not affect runtime
- generated/scaffold artifacts with no imports, tests, scripts or CI references
- unused imports/variables found by current-main lint/typecheck
- duplicate documentation that is byte-for-byte superseded

## Release rule

`current main -> consolidation branch -> exact diff review -> CI/test/build PASS -> merge`

A clean merge does not certify Production. No production deployment is authorized by this branch.
