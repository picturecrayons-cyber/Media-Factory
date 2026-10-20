# Bridge staging verification runbook

Status: **NOT RUN — evidence must be collected on the isolated staging candidate**.

This runbook is intentionally evidence-first. Passing unit tests or the preview configuration preflight is not proof that staging UI, database transactions, Loop sync, or buyer access behave correctly.

## Safety boundary

- Run only against the dedicated non-production candidate and disposable database.
- Use synthetic titles/assets and test identities. Do not use real buyer payments or production buyer records.
- Before any mutation, capture candidate SHA, environment identity, test IDs, and a redacted before-state snapshot.
- Never copy credentials, signed URLs, private keys, payment secrets, or buyer PII into GitHub.
- Stop immediately if the UI/API resolves to production, if the disposable database guard is absent, or if cleanup/rollback fails.
- Do not merge PRs, deploy production, or change production records/settings as part of this runbook.

## 0. Candidate and environment identity

- [ ] Record full 40-character candidate SHA and confirm the browser app, API/server functions, and test workflow use that exact SHA.
- [ ] Confirm GitHub Actions environment `bridge-preview-storage` is configured with preview-only credentials.
- [ ] Confirm Supabase project ref is the non-production staging project; confirm disposable PostgreSQL is a separate, explicitly disposable host.
- [ ] Confirm OCI tenancy and bucket equal the preview allowlist; confirm Razorpay key is test-mode only.
- [ ] Save run URLs and redacted logs. Do not record secret values.

**Evidence:** candidate SHA, workflow run URL, environment/project identifiers (not credentials), PASS/FAIL, operator, timestamp.

## 1. Super Admin and admin workflow UI

Use a dedicated test Super Admin account; verify unauthorized roles separately.

- [ ] Sign in; verify session is authenticated and role is Super Admin.
- [ ] Open the title administration workspace and Deduplication tab.
- [ ] Verify candidate groups show normalized title identity (name + language + year) while preserving individual record IDs and statuses.
- [ ] Open Admin Preview. Confirm it is read-only and presents dependencies/block reasons before any mutation.
- [ ] Attempt preview as a non-admin test identity; confirm server-side denial (not merely hidden UI).
- [ ] Verify QC transition is disabled until required metadata, master asset, poster/artwork, and other configured QC prerequisites are satisfied.
- [ ] Verify archive action requires explicit confirmation and refuses live/buyer-visible records or records with unresolved dependencies.
- [ ] Verify every rejected action leaves records and references unchanged.

**Evidence:** screenshots with test data only, API response status, before/after record counts, and audit event IDs.

## 2. Duplicate merge dry-run and transaction behavior

Use synthetic duplicate records only. Capture the full dependency inventory before each scenario: assets/checksums, aliases, title history, owner, rights, buyer visibility, orders, active licences, deliveries, and Loop publications.

- [ ] Dry-run an exact duplicate with no conflicting dependencies; verify a preview/plan is returned and no database writes occur.
- [ ] Dry-run identity uncertainty, language/territory/exclusivity/window conflicts, buyer mapping conflicts, asset-version conflicts, delivery conflicts, and Loop publications; verify each returns HOLD/BLOCK with explicit reasons.
- [ ] Verify the buyer-visible/live record scenario is blocked from automatic merge.
- [ ] Execute one approved synthetic staging merge only after dry-run evidence and independent operator confirmation.
- [ ] Verify transaction atomicity: force a controlled failure in staging and confirm no partial aliases, asset reassignment, status change, or audit inconsistency remains.
- [ ] Verify successful merge preserves all assets/checksums, title history, ownership, rights, buyer visibility, orders/licences, delivery references, and aliases.
- [ ] Verify rollback restores the exact pre-merge state and leaves an auditable rollback record.
- [ ] Verify idempotent retry does not duplicate aliases/audit links or repeat destructive changes.
- [ ] Verify a record with unresolved references cannot be soft-archived.

Do not use the real Jananam records as mutation fixtures.

**Evidence:** redacted before/after snapshots, dry-run plan, transaction outcome, rollback outcome, reference counts/checksums, audit IDs.

## 3. Loop sync (staging only)

- [ ] Use a synthetic staging title and a non-production Loop destination/tenant.
- [ ] Capture source metadata, rights, asset IDs/checksums, publication IDs, and status before sync.
- [ ] Run a single test synchronization and verify the returned remote ID is mapped to the correct source record.
- [ ] Verify metadata, rights, asset references, version identifiers, and ownership remain consistent after sync.
- [ ] Retry the same event; verify idempotency and no duplicate publication or unintended buyer-visible record.
- [ ] Test a controlled failure; verify retries/cleanup are observable and source state remains recoverable.
- [ ] Confirm no production Loop endpoint, production credentials, or real buyer title was used.

**Evidence:** redacted request/result IDs, source/remote mapping, before/after comparison, retry result, cleanup result.

## 4. Jananam live-record reconciliation — READ ONLY

These IDs are production-sensitive business records; do not mutate them during staging verification.

- [ ] Verify candidate canonical record `cb8c141dc72d727a53a4f35d8851e100` against authoritative title identity and ownership; keep it proposed until reviewed.
- [ ] For `legacy-film-7`, inventory live buyer visibility, orders, active licences, rights/territories/windows, ownership, asset references, deliveries, and Loop publication references.
- [ ] Confirm buyer access and delivery remain available throughout reconciliation; document any conflicting or missing dependency.
- [ ] For `6eec48a7c576789ede558e66ba18b929`, verify typo/title identity against source-of-truth records and inventory every dependency. Do not merge/soft-archive until a fresh dry-run is SAFE and an independent reviewer approves.
- [ ] Record a decision per record: KEEP, HOLD, or eligible-for-reviewed-staging-test. No production merge is authorized by this checklist.

**Required guard:** `legacy-film-7` stays untouched and buyer-visible until rights/order/licence/delivery review is complete and an explicit separately approved migration plan exists.

## 5. Evidence and release review

- [ ] Attach each test's candidate SHA, environment, timestamp, operator, PASS/FAIL, test/run URL, and redacted evidence to Issue #314.
- [ ] Mark only gates directly supported by evidence. Configuration preflight is not a live service test.
- [ ] Independent reviewer verifies evidence, rollback, isolation, and all unresolved buyer/rights/delivery risks.
- [ ] Re-run required checks on the exact final candidate SHA after any code change.
- [ ] Keep production release **HOLD — NOT CERTIFIED** until every required gate has evidence and independent approval.

## Result record template

```text
Candidate SHA:
Environment (must be non-production):
Test / scenario:
Timestamp (UTC):
Operator:
Result: PASS | FAIL | BLOCKED | NOT RUN
Run / evidence URL:
Redacted evidence location:
Before/after invariants checked:
Cleanup / rollback result:
Unresolved risks:
Reviewer:
```
