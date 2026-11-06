# Crayons Bridge Full Application Verification — 2026-11-06

## Executive result

**NOT CERTIFIED — full end-to-end verification is blocked.** Read-only production route checks, Testing DB security/schema checks, and available GitHub CI were completed. The public app is reachable, but the current PR revisions do not have a usable staging Preview, and authenticated Creator/Studio/Buyer/internal workflows plus live OCI, Razorpay and mail integrations were not exercised.

**Production remains HOLD / NOT CERTIFIED / NO-GO.** No production database mutation, deployment, environment-variable change, payment, email, upload, or deletion was performed.

## Environment separation

| Surface | Verified identity / result |
|---|---|
| Production Supabase | `mlmgugivsyoxzdgwkbpu`, ap-southeast-1; read-only audit only |
| Testing DB | `jbymleftneggcgutlcqu`, ap-south-1, PostgreSQL 17.11; staging migrations and rollback-only assertions |
| Production public domain | `www.crayonspictures.in` responds |
| Staging custom hostname | `staging.crayonspictures.in` returns DNS NXDOMAIN |
| PR #485/#486/#487/#489/#490 Vercel Preview env bindings | No branch-specific environment bindings found for the active PR heads checked |
| Responsive certification branch | `chore/bridge-responsive-certification-20261105` has 45 branch-scoped Preview variables targeting Testing DB and fail-closed empty integration credentials; a READY Preview exists at commit `eca905d566f4dff298ce0d34f9394face314ee13` |
| Legacy branch | `feat/crayons-bridge-production` retains Preview Supabase URL `uakpqqardziifcwzvgfx` and non-empty SMTP Preview settings. This is stale/ambiguous configuration and was not changed. |

The responsive-certification Preview is not the current PR #490/#487/#489 code revision. The staging custom hostname does not resolve. The old `feat/crayons-bridge-production` Preview configuration must be retired or corrected only after its ownership/use is confirmed; no Vercel environment values were changed in this audit.

## Testing DB

Target: `jbymleftneggcgutlcqu` only.

### Applied migration ledger entries

- `bridge_testing_workspace_rls_20261106`
- `bridge_asset_storage_provenance_0022_20261106`
- `bridge_server_authoritative_uploads_0023_20261106`
- `bridge_titles_no_browser_update_policy_20261106`
- `bridge_workspace_verified_identity_guard_20261106`

**Correction to the earlier report:** migration 0023 is recorded as applied in the Testing DB migration ledger. The `checksum_sha256` column and private multipart/session/job tables are present. This corrects the earlier statement that migration 0023 had not been applied. This ledger/schema evidence does not prove a live upload or SHA-256 computation.

### RLS and privileges

- 43 public tables have RLS enabled.
- 10 public workspace tables have 17 explicit policies in the live `pg_policies` view.
- 33 public RLS-enabled tables have no policies.
- Three `bridge_private` tables have RLS enabled and no policies.
- No `anon` or `authenticated` table grants were found on Testing DB public or `bridge_private` tables; `bridge_private` schema usage is not granted to either role.
- The Testing DB security advisor therefore counts 36 RLS/no-policy findings (33 public + 3 private). These tables remain deny-by-default and are not to be opened with blanket policies.
- Rollback-only role assertions previously recorded 10 PASS, including Creator ownership, Buyer denial, verified admin, unverified Creator denial and no automatic super_admin bypass.

The live policy count is 17, not 18 as stated in one earlier draft note. A rollback-only revoked-Studio-membership assertion reproduced an authorization bypass: `can_manage_title` returned true for a Studio user whose membership row was `removed`, because `owner_user_id` matched. This is a security blocker, not merely an advisor warning.

### Storage provenance

All five columns exist on `public.bridge_assets`. The live schema has two provider CHECK constraints: one allows `oci`, `aws_s3`, `cloudflare_r2`; the second also mentions `supabase_storage`. Since both constraints apply, the effective accepted set remains the three requested providers. The redundant/overlapping constraint should be consolidated in a future staging migration.

## Production DB — read-only security inventory

Production ref: `mlmgugivsyoxzdgwkbpu`. No changes were made.

- 73 public tables have RLS enabled.
- Security advisor reports 12 RLS-enabled/no-policy findings.
- 10 public tables have anon/authenticated grants; the audited grant-bearing tables had explicit deny or scoped owner/internal policies. The 12 no-policy tables were not among the grant-bearing list.
- The advisor still reports security hardening work, including leaked-password protection. Production remains on HOLD; do not apply Testing DB migrations to Production.

## Public application route smoke test

Read-only GET/navigation tests against `https://www.crayonspictures.in`:

- Homepage, login and signup returned HTTP 200.
- 18 requested paths returned HTTP 200.
- 12 protected paths (Creator, Studio, Buyer, Investor, Admin, Workspace, Deliveries, CMS, Admin-CMS, Internal, Submit Film, Title Workspace) rendered the unauthenticated sign-in gate and client-side navigated to `/login`; no private data was observed.
- Privacy, Terms, Contact, Forgot Password, Reset Password and Verify Email remained public. Verify Email displayed “Missing token” when opened without a token.
- No credentials were entered and no form was submitted.

This verifies logged-out routing only. It does not verify role-specific authenticated access.

## GitHub CI and pull requests

- PR #485: CI and Scope A PostgreSQL verification PASS.
- PR #486: gate and `workflow-postgres` PASS; 159 tests passed, 0 failed on the checked revision.
- PR #490: gate and `workflow-postgres` PASS on the checked revision; 159 tests passed, 0 failed.
- PR #487 and PR #489: no GitHub Actions pull-request workflow run was found for the checked commits. Their base branches are not included in the current CI workflow pull-request branch filter. Do not infer CI success from PR #486/#490.
- Vercel build status has been rate-limited/failed for the active branch work; no current PR-head Preview was certified.

## Code-review blockers found

These are source-level findings; they were not exercised against authenticated runtime users.

1. **Multipart actor identity mismatch (high):** `requestAssetUpload` stores `bridge_profiles.user_id` in `bridge_assets.created_by`, but multipart session creation stores `context.userId` (Supabase Auth UUID) in `upload_sessions.actor_user_id`. The verification worker passes that session value into `persistVerifiedAsset`, whose SQL requires `bridge_assets.created_by = actorUserId`. When a Bridge identity-link maps Auth UUID to a different Bridge user ID, worker persistence can fail. Use one canonical Bridge actor ID for ownership persistence and keep the Auth subject separately if needed for session binding.

2. **Worker crash recovery (high):** job claiming selects only `queued` and `failed`. A job left `running` after process termination is not reclaimed by a stale-lock timeout. Add a bounded stale-running reclaim policy and retry ceiling/dead-letter state.

3. **Buyer visibility and response redaction (critical):** `canReadTitle` permits Buyers based on title status alone. `getTitle` then skips `assertBuyerPublishable` when that status check succeeds; `listTitleAssets` uses the same status-based check. The Buyer catalog list has a separate global publication predicate but does not filter by a buyer-specific access row. More seriously, Buyer `listTitles` and `getTitle` both pass database rows through `mapTitle`, which includes `ownerUserId`, `ownerOrganizationId`, `posterKey` and `masterKey`; `getTitle` also returns title event history. This conflicts with Buyer-safe response requirements and can disclose storage keys/internal workflow metadata. Add a dedicated Buyer-safe DTO, redact keys/owner IDs/events, and enforce buyer-specific access plus publication, territory, language and active-window gates in list, direct-ID, asset-list and download handlers. Add Buyer A/B tests.

4. **Studio membership bypass (critical; reproduced on Testing DB):** server RBAC and the Testing DB `can_manage_title` helper allow direct `owner_user_id` matches as an alternative to active Studio organization membership. A rollback-only Testing DB test created a Studio owner with membership status `removed`; `bridge_private.can_manage_title(title_id)` returned `true`. The stated policy is active-membership-only. Make Studio ownership depend on a matching active membership and active organization status in both SQL and server RBAC, and remove the direct owner-user fallback for Studio titles.

5. **Draft deletion referential safety (medium/high):** `deleteDraftTitle` checks many important references but does not check every title child FK found in the schema, including title events, gate certifications, buyer access, language rights, license/package records, story-concept submissions and investor references. A hard delete may cascade records not explicitly approved for deletion. Expand the blocker query or use an audited soft-delete model.

6. **Streaming route regression (corrected in Draft branch):** PR #489 initially created a stream token but returned a stale `signed.url` variable. Corrected in commit `f0a0089370c0d5e2a4620cdc5924c20fe4a14cf7` to return the tokenized Bridge stream URL. No CI run has yet verified this correction.

7. **Streaming edge cases (medium):** stream handler does not re-evaluate current entitlement/revocation after token issue; token is a short-lived bearer capability (60 seconds). Range failures (416) are normalized to 502, and content-length fallback should not report full-object size for a range response. Define revocation semantics and preserve correct 206/416 headers.

8. **Studio UI visual acceptance:** not verified against PR #490 because its branch has no Preview deployment and the staging hostname is NXDOMAIN. The older responsive-certification Preview is a different commit.

## Integration and workflow acceptance

| Workflow | Result |
|---|---|
| Logged-out public routes | PASS |
| Logged-out protected-route gating | PASS |
| Testing DB migrations / RLS rollback assertions | PASS |
| PR #485/#486/#490 CI | PASS |
| PR #487/#489 CI | NOT RUN |
| Authenticated Creator lifecycle | NOT VERIFIED |
| Active/inactive Studio membership isolation | NOT VERIFIED |
| Buyer A/B isolation and territory/language windows | NOT VERIFIED |
| QC/legal/rights workflow | NOT VERIFIED end-to-end |
| Multipart upload against OCI | NOT VERIFIED |
| Worker retry/crash recovery | NOT VERIFIED |
| SHA-256 live object digest | NOT VERIFIED |
| Buyer stream and revocation runtime | NOT VERIFIED |
| Razorpay sandbox payment/webhook/refund | NOT VERIFIED |
| SMTP test delivery | NOT VERIFIED |
| Loop publication/playback integration | NOT VERIFIED |
| Studio heading visual and Draft Delete/Continue browser acceptance | NOT VERIFIED |

## Immediate next actions

1. Restore a resolvable staging hostname or select a current Preview deployment tied to the exact corrective PR head.
2. Correct branch-scoped Preview environment bindings so only Testing DB is used and OCI/payment/mail secrets remain disabled until safe sandbox credentials are approved.
3. Fix the source-level blockers above in Draft PRs and enable CI for the PR #487/#489 branch chain.
4. Run authenticated role-matrix tests, Studio UI visual tests, OCI multipart upload and SHA-256 object verification, then sandbox payment/mail/Loop tests.
5. Re-run advisors and full release gates. Production approval is a separate decision.

**Final decision: Production HOLD / NOT CERTIFIED / NO-GO. No merge or production change was performed.**
