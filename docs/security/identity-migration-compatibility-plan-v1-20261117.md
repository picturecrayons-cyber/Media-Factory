# Identity Migration Compatibility Plan v1.0

**Status: Draft for review — no database migration or application rollout authorized by this document.**

## Scope and invariants

This plan addresses the Bridge identity relationship only:

- `bridge_profiles.user_id` is the canonical Bridge profile identifier.
- `auth.users.id` is the canonical authentication subject.
- `bridge_loop_identity_links.bridge_user_id` maps to `bridge_profiles.user_id`.
- `bridge_loop_identity_links.auth_user_id` maps to `auth.users.id`.
- A verified email is evidence for a manual review workflow, never sufficient proof to auto-bind an existing profile.
- Account RBAC remains separate from Loop payment entitlements.
- No profile, Auth user, identity link, role, title owner, organization membership, payment, entitlement, or publication row may be silently rewritten or deleted.

**No identity migration may change Production until the staged compatibility gates in this document pass.**

## Current environment facts (read-only snapshot, 2026-11-17)

### STAGING / Testing DB

Project: `jbymleftneggcgutlcqu`

- `bridge_profiles`: 1 row.
- `bridge_loop_identity_links`: 0 rows.
- `bridge_loop_identity_links.bridge_user_id` currently references `bridge_profiles(user_id)`.
- `auth_user_id` references `auth.users(id)`.
- `public."user"`, `public.account`, `public.session`, and `public.verification` were absent in the inspected schema.

**Implication:** STAGING has the target FK shape but no identity-link fixtures. It cannot certify existing-account mapping, duplicate/conflict behavior, or migration compatibility using live identities.

### PRODUCTION DB

Project: `mlmgugivsyoxzdgwkbpu`

- `bridge_profiles`: 6 rows.
- `bridge_loop_identity_links`: 6 rows.
- `public."user"`: 6 rows.
- `public.account`: 3 rows.
- `public.session`: 16 rows.
- `public.verification`: 15 rows.
- `bridge_loop_identity_links.bridge_user_id` currently references `public."user"(id)`.
- `auth_user_id` references `auth.users(id)`.
- Earlier read-only crosswalk reconciliation found six aligned profile / legacy-user / Auth mappings, with no null or duplicate IDs in the inspected set.

**Implication:** the six currently aligned identities are not sufficient evidence to drop the legacy FK or tables. The live account/session/verification rows and their application consumers require an explicit compatibility and lifecycle decision.

## Required identity-resolution contract

Resolution order:

1. Reject malformed or blocked Auth subjects.
2. Accept an exact direct match only when `auth.users.id = bridge_profiles.user_id` and the profile is uniquely present.
3. Otherwise accept exactly one explicit `bridge_loop_identity_links` mapping whose Auth FK and Bridge-profile FK both validate.
4. If no direct or explicit mapping exists, return unresolved / onboarding-required. Do not infer ownership by email.
5. If duplicate, conflicting, orphaned, or ambiguous mappings exist, fail closed and route to manual review.

The direct-match path and explicit-link path must produce the same canonical Bridge profile ID for all protected operations. No fallback may silently switch account ownership.

## Backward-compatible migration sequence

### Phase 0 — inventory and freeze

- Inventory all source references, SQL migrations, FK dependencies, views, triggers, functions, jobs, auth callbacks, account/session lifecycle paths, and operational scripts touching `public."user"`, `public.account`, `public.session`, `public.verification`, `bridge_profiles`, and `bridge_loop_identity_links`.
- Confirm the exact active runtime and dependency graph for Better Auth and Supabase Auth. A package declaration, comment, or retirement test alone is not runtime proof.
- Record FK names, delete/update actions, indexes, owners, RLS, ACLs, default ACLs, and row counts in both environments.
- Freeze identity DDL/DML until the inventory and test harness are reviewed.

### Phase 1 — source compatibility (no DB change)

- Implement the fail-closed resolver contract above behind unit tests.
- Remove email-only auto-binding and raw Auth-subject fallback for protected Bridge actor resolution.
- Change onboarding/session synchronization so it never creates or updates a legacy identity mirror as an implicit prerequisite for a valid Bridge profile.
- If any still-active legacy auth consumer requires `public."user"`, keep its compatibility adapter isolated and explicitly documented; do not let it become the canonical Bridge profile authority.
- Resolve the Better Auth dependency/package-lock/runtime inconsistency only after tracing actual imports, transitive usage, migrations, and deployed build artifacts.
- Preserve existing verification behavior: email challenge records must store the canonical Bridge profile ID, not an Auth UUID when those differ.

### Phase 2 — additive database compatibility (STAGING only after separate gate)

- Add and validate a FK from `bridge_loop_identity_links.bridge_user_id` to `bridge_profiles(user_id)` if it is not already present.
- On PRODUCTION, retain the existing FK to `public."user"(id)` during the compatibility period. Do not drop it in the same change that adds the profile FK.
- Do not backfill, rewrite, delete, or synthesize identity links automatically. First produce a read-only row-by-row mapping report; every proposed write must be deterministic, conflict-free, and separately approved.
- If both FKs are retained temporarily, validate that every row satisfies both references and that all profile/legacy IDs are intentionally identical. A mismatch blocks rollout.
- Keep `public."user"`, `account`, `session`, and `verification` intact. No table drops, row deletion, session invalidation, or Auth-user deletion in this phase.
- Any migration must be additive, idempotent, guarded by catalog/data preconditions, and tested against an isolated PostgreSQL 17 database using the exact canonical migration source.

### Phase 3 — consumer cutover and observation

- Cut over application reads/writes only after source tests, migration replay, and STAGING authenticated flows pass.
- Monitor unresolved identities, mapping conflicts, failed verification, and session lifecycle behavior without logging email addresses, tokens, or other secrets.
- Maintain a reversible compatibility window. Existing users must continue to resolve to the same Bridge profile ID before and after cutover.
- Do not silently reauthenticate, merge accounts, or change profile ownership.

### Phase 4 — legacy retirement (separate decision)

- Only after an exhaustive consumer search and runtime proof shows no remaining dependency may a proposal be made to retire legacy tables/FKs.
- `public.account`, `public.session`, and `public.verification` contain live rows in PRODUCTION. Their migration, expiry, or retention policy requires a separate lifecycle and recovery decision.
- Dropping the legacy FK or tables is a separate migration with its own approval, backup/recovery evidence, dependency scan, and rollback plan. It is not included in this PR.

## Required regression and database tests

The exact-head test suite must cover:

- Direct Auth UUID equals Bridge profile ID.
- Explicit Auth-to-Bridge mapping where IDs differ.
- Missing mapping and missing profile.
- Duplicate Auth mapping, duplicate Bridge mapping, orphaned FK and conflicting mapping.
- Same email on different Auth and Bridge IDs: no automatic adoption.
- Unverified email and changed email: no ownership reassignment.
- Existing linked user login before and after cutover resolves to the same Bridge ID.
- Email verification challenge stores and updates the canonical Bridge ID.
- Onboarding transaction atomicity: profile, identity link, invite consumption and organization membership either all commit or all roll back.
- Auth-user deletion and legacy account/session deletion behavior, including FK restrict/cascade semantics.
- Creator, Studio, Buyer, Admin and Super Admin role resolution remains unchanged.
- Loop viewer identity remains separate from Bridge RBAC and TVOD entitlements.
- RLS / SECURITY DEFINER helper behavior under the real application roles, including direct profile and explicit-link paths.
- Migration replay against empty and representative legacy schemas, duplicate/orphan rejection, idempotent rerun, and rollback/recovery.

Tests must use synthetic identities in a disposable local PostgreSQL 17 environment. Do not seed synthetic identities into either shared Supabase project or Production Auth.

## Rollback and recovery

- Code rollback: revert to the last verified source revision; do not rely on a Vercel rollback as a substitute for DB compatibility.
- Additive FK rollback: remove only the newly added FK after confirming no dependent code relies on it; preserve all identity rows.
- Data repair: no automatic reverse mapping. Restore from a verified backup or execute a separately reviewed deterministic repair script.
- Never delete audit evidence, profile rows, identity links, legacy user rows, account/session/verification rows, or Auth users as a rollback shortcut.
- Session recovery: preserve existing sessions where possible; if invalidation is unavoidable, require an explicit user-impact and reauthentication plan.
- Production recovery requires a pre-change backup/restore point and named operator verification before any Production write.

## Execution gates and environment controls

| Environment / system | Action | Access | Risk | Gate |
|---|---|---|---|---|
| STAGING / Testing DB `jbymleftneggcgutlcqu` | Catalog/data reconciliation | READ-ONLY | Low | May continue |
| STAGING / Testing DB | Additive FK / migration | WRITE | High | Blocked until source and disposable replay tests pass |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | Catalog/data reconciliation | READ-ONLY | Low | May continue |
| PRODUCTION DB | FK / schema / data migration | WRITE | Critical | Separate production go/no-go after STAGING evidence |
| GitHub | This compatibility plan | WRITE (branch only) | Low | Draft PR only |
| GitHub | Application code changes | WRITE (branch only) | Medium | Separate exact-head review and CI |
| GitHub | Merge to main | WRITE | High | Not authorized by this draft |
| Vercel | Preview / Production deployment | WRITE | Critical | Not authorized by this draft; Preview runtime access currently returned 403 |
| Razorpay / Hostinger Mail / OCI | Provider actions | None | Critical | Out of scope |

## Current decision

- Architecture direction: **PROPOSED**.
- STAGING migration readiness: **BLOCKED** (no identity fixtures; source compatibility and disposable replay not yet evidenced).
- PRODUCTION migration readiness: **BLOCKED** (legacy FK and live account/session/verification dependencies).
- Better Auth retirement consistency: **FAIL / unresolved** until dependency, lockfile and runtime proof reconcile.
- Authenticated STAGING E2E: **NOT RUN**.
- Production rollout: **HOLD / NOT CERTIFIED / NO-GO**.

**Zero-regression rule: App-inu pani kittaruthu.**
