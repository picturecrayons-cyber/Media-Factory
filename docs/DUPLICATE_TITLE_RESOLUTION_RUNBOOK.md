# Duplicate title resolution: safe preview, merge, and rollback

## Safety contract

- A duplicate merge is a metadata/reference migration, never a hard delete.
- The retiring record is retained with `merged_into_title_id`, `merged_at`, an alias, and a pre/post-state audit record.
- Preview requires explicit `identityCertain: true`. A merge request separately requires `identityAttested: true` and merge-specific permission.
- The transaction locks both title rows and refuses self-merges, already-merged titles, and a retiring ID that already has an alias.
- Owner/user or owner-account-type differences, lifecycle differences, runtime differences, language/rights collisions, buyer/asset/delivery collisions, buyer-facing status, Loop links/publications, pending legacy-media migration rows, or rental entitlements fail closed.
- Rollback is audit-ID scoped, restores reference rows captured in the pre-merge snapshot, restores the original title status, removes the matching alias, and marks the audit `ROLLED_BACK`. A second rollback is rejected.

## Current Jananam 1947 case

Canonical candidate: `cb8c141dc72d727a53a4f35d8851e100`

Legacy record: `legacy-film-7`

Expected preview result: **BLOCK/HOLD**, not SAFE. The records have different owners, different lifecycle states, and 106 vs 105 minute runtimes. The legacy record also has a Loop title/publication relationship, three pending legacy-media migration rows, and a rental-entitlement record that needs status/expiry reconciliation. No production merge or retirement is authorized by this implementation.

Do not change ownership or imply rights transfer through this workflow. The title owner and authorized rights representative must resolve ownership and metadata outside the automated merge.

## Staging-only dry run

1. Use an isolated staging database and isolated storage credentials. Never point a Preview deployment at production Supabase or production OCI.
2. Create synthetic titles with distinct IDs and synthetic assets. Do not copy real buyer, entitlement, payment, or private media data into fixtures.
3. Exercise a clean same-owner/same-status/same-runtime duplicate with no Loop, migration, entitlement, rights, buyer, asset-version, or delivery conflicts. Verify preview is SAFE only after an explicit identity assertion.
4. Exercise each fail-closed case: identity not attested; owner/account type mismatch; runtime mismatch; lifecycle mismatch; buyer-facing status; language/territory/window/exclusivity collision; nonidentical buyer mapping; asset-version collision; delivery collision; Loop publication/title; pending media migration; and rental entitlement.
5. Attempt the same merge twice. The second attempt must fail without changing references or creating a second alias.
6. Roll back by audit ID. Verify every moved reference points back to the retiring ID, the original status is restored, the alias is removed, and the audit is marked `ROLLED_BACK`. A second rollback must fail.
7. Verify both legacy and canonical URL resolution, buyer authorization, asset checksums, title events, and storage object existence with synthetic assets.
8. Capture test output and reviewer approval before any production change is considered.

## Test commands

- `npm test` includes `src/lib/bridge/duplicate-title-merge.test.ts`.
- `npm run typecheck`
- `npm run lint`

Do not apply schema migrations, deploy, merge this PR, or mutate production as part of the dry run. CI and independent review must pass before staging execution; production requires a separate approved change plan and backup.
