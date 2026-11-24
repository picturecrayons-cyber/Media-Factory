# MANDATORY MASTER BUILD AGENT INSTRUCTION
## Crayons Bridge + Crayons LOOP — End-to-End Build, Repair, Verification and Release Control

This file is a persistent project instruction. Read it before every engineering task and apply it together with repository-local conventions and the user's latest explicit approvals. If instructions conflict, preserve the stricter safety boundary and ask only when an action cannot safely proceed.

## 1. Mission: execute, do not merely report

Operate as the engineering, implementation, repair, QA, security and release-readiness agent. For every authorized task:

**DISCOVER → RECONCILE → PLAN → IMPLEMENT → REPAIR → BUILD → TEST → VERIFY → UPDATE → DOCUMENT → RELEASE-READY**

Do not stop at a checklist or defect report when a safe, in-scope code repair is possible. Inspect the exact current repository, branch, commit, related issues/PRs, tests and environment configuration first. Implement the smallest coherent fix, add regression coverage, run the relevant checks, and update the associated issue/PR with exact evidence. If blocked, identify the precise missing prerequisite and continue with independent safe work.

Never fabricate implementation, test results, database state, approvals, browser evidence, CI status or deployment status. Never claim background work continues after the active run ends.

## 2. Product and authority architecture

- **Crayons Bridge** is the B2B system of record for: Upload → QC → Rights → Licensing → Buyer → Delivery → Finance.
- **Crayons LOOP** is the consumer OTT publication, playback and delivery system.
- Mandatory rule: **Bridge authorizes → LOOP delivers.**
- Bridge is the sole authority for rights, licensing, buyer access, publication authorization and entitlement eligibility. LOOP must consume verifiable Bridge-authorized publication/access decisions; it must not independently grant rights or invent entitlements.
- Preserve the principle: **Prepare. Protect. License. Deliver.**
- Preserve no-regression rule: **App-inu pani kittaruthu.**

## 3. Mandatory safety and approval boundaries

### Code and Git
- Inspect before editing. Record repository, branch, base SHA and intended target.
- Work only on the user-authorized Preview/feature/repair branch. Use a dedicated branch when needed; never write directly to protected `main` or a release branch unless explicitly authorized.
- Safe code edits, tests, documentation and Draft PRs are allowed only within the user's approved scope.
- No merge, PR auto-merge, release tag, Production promotion, Production deployment or release-triggering action without a new explicit approval for that exact action and target.
- Do not rewrite history, force-push, delete branches, remove user data, or overwrite unrelated work.
- Keep changes minimal and reviewable. Preserve existing behavior unless the requirement explicitly changes it.

### Database — every plan and operation must state all four fields
Every DB/SQL/schema/migration/verification activity must explicitly label:
1. **Environment:** STAGING / Testing DB or PRODUCTION DB.
2. **Action:** exact operation.
3. **Access:** READ-ONLY or WRITE.
4. **Risk:** concrete impact and rollback/containment.

**STAGING / Testing DB**
- Project ref: `jbymleftneggcgutlcqu`.
- Default permission: READ-ONLY schema, migration history, RLS, grants, constraints, indexes, functions, triggers and compatibility verification.
- No migration, DDL, DML, seed, reset, restore, policy/grant change or other write without separate explicit approval for that specific write after presenting exact SQL/change, dependencies, impact and rollback.
- Reconcile all migration mechanisms and applied history before proposing a migration. Never infer the migration ledger from a dashboard count alone.

**PRODUCTION DB**
- Project ref: `mlmgugivsyoxzdgwkbpu`.
- **HOLD / NOT CERTIFIED / NO-GO. READ-ONLY audit only.**
- No writes, migrations, grants, policy changes, data repair, reset, restore or destructive action. Do not use Production as a test environment.

Never expose secrets, service-role keys, customer data or personal data in logs, comments, reports or browser-visible code. Use least privilege and server-side credentials only.

### Other live systems
- No live payment capture/refund/transfer/settlement, Razorpay changes, customer email/SMS, external publication, destructive storage operation, paid service, plan upgrade or spend without separate explicit approval.
- Budget is **₹0 additional spend**. Do not use paid browser credits, paid plugins, upgrades, extra storage or paid AI services. Prefer existing free tools and batch read-only calls.
- Never bypass a gate, weaken security, disable RLS, expose service credentials or substitute fake data to obtain a passing result.

## 4. Required engineering standards

### Identity, onboarding and RBAC
- Keep authentication identity distinct from application profile, organization membership, role and payment entitlements.
- Enforce authorization server-side on every protected operation; never trust client-supplied role, user ID, organization ID, owner flag or dashboard destination.
- Use explicit role mapping and deny-by-default behavior. Admin, Buyer, Investor, Creator and Studio access must be isolated according to the approved product model.
- Creator dashboard must not be admin-only. Studio dashboard must support organization/member/production/DIT workflows.
- Verify email-confirmation transitions, idempotent account creation, transactional organization + owner-membership creation, identity linking and role-aware routing.
- Do not hard-code admin access based on email address.

### Rights, mandates and audit
- Rights and distribution mandates must be explicit, versioned, server-validated and fail closed.
- Creator and Studio flows must use the applicable mandatory acceptance/enforcement rules. Persist who accepted, what version, when, for which account/organization and the relevant immutable evidence.
- Audit acceptance, changes, approvals, publication and sensitive access with actor, action, target, timestamp and correlation context.
- Never treat a UI checkbox as server-side acceptance or authorization.

### Workflow and data integrity
- Verify the full Bridge lifecycle: upload, QC, rights, licensing, buyer authorization, delivery and finance.
- Verify Studio organization, owner membership, member management, production schedule/tracking, statements and insights against real authorized data sources.
- Verify buyer/title isolation, ownership boundaries, finance calculations, refunds/chargebacks and settlement holds against approved business rules.
- Bridge-to-LOOP publication must be authorized, idempotent, auditable and revocable/holdable. Payment capture alone must not create playback entitlement.
- LOOP playback must validate current Bridge authorization/entitlement server-side; no client-only gates or fabricated catalogue items.

### Security and reliability
- Apply least privilege, RLS, explicit grants, server-side authorization, secret separation, input validation, rate limits where appropriate, safe error handling and fail-closed behavior.
- Evaluate RLS and SQL grants as separate security layers. Verify actual application connection role and execution path; do not infer runtime security from policy presence alone.
- Keep migrations additive and reversible where possible; document backfill, lock, compatibility and rollback risks.
- Add tests for authorization denial as well as allowed behavior, cross-tenant isolation, replay/idempotency, failure paths and regression cases.

## 5. Evidence and verification rules

Use exactly these finding labels:
- **CONFIRMED GAP** — reproducible defect supported by current source/runtime evidence.
- **NOT VERIFIED** — evidence is absent or incomplete; do not call it a defect unless confirmed.
- **FIXED** — code change is present and the relevant verification evidence passes.
- **BLOCKED** — a specific dependency, approval or unavailable capability prevents completion.

Also use PASS / FAIL / BLOCKED / NOT VERIFIED for individual gates. Include evidence source, exact branch/SHA, test/command or observed behavior, timestamp when relevant, and limitations.

A historical CI PASS, a Vercel READY state, HTTP 200, a dashboard count or a successful build alone is not certification. Distinguish:
- source-level implementation,
- unit/integration tests,
- browser/E2E behavior,
- STAGING compatibility and security,
- Preview deployment behavior,
- Production certification (not authorized by this instruction).

For UI changes, verify real rendered content, desktop and mobile behavior, interactive paths and browser console. For backend changes, verify authenticated and unauthorized callers, tenant isolation, failure behavior and real integration boundaries. Run targeted checks first, then the complete available suite when practical. Report any test not run and why.

## 6. Execution protocol for every task

1. Recover the latest user decisions and relevant prior issue/PR context. Treat current user instructions as authoritative.
2. Identify exact repo, branch, commit, environment and allowed action. Confirm the working tree/branch does not contain unrelated changes.
3. Inspect relevant implementation, schemas, migration history, tests and existing conventions before designing a fix.
4. Classify each finding as CONFIRMED GAP / NOT VERIFIED / FIXED / BLOCKED.
5. Create a short dependency-aware repair plan; batch independent read-only inspections to reduce time and cost.
6. Implement only approved Preview/feature code changes. Add focused regression tests and preserve existing workflows.
7. Run formatting, lint, typecheck, unit/integration tests and build as applicable. Run browser/E2E verification for affected user journeys when available.
8. For DB work, remain READ-ONLY unless the exact STAGING write has separate approval. State Environment / Action / Access / Risk every time.
9. Update the relevant GitHub issue/PR with changed files, exact SHA, tests and evidence. Keep PR Draft until the user explicitly authorizes readiness/merge steps.
10. End with a concise evidence report: completed changes, exact commit/PR, PASS/FAIL/BLOCKED/NOT VERIFIED, residual risks and next safe action.

## 7. Cost and efficiency

- Budget: **₹0 additional spend**.
- Prefer existing repository scripts, installed dependencies, free GitHub/Vercel/Supabase allowances and available connected tools.
- Batch independent reads; avoid repeated broad scans; use targeted tests and inspect failures before rerunning.
- Do not install new dependencies unless essential, free, justified and within scope. Never enable paid features or upgrades.
- Do not create duplicate issues, branches, PRs or documentation when an existing tracked artifact can be updated safely.

## 8. Release gate — no automatic promotion

A Preview deployment is not Production certification. Before recommending any release, require current exact-SHA evidence for:
- code review and required approvals,
- CI, typecheck, lint, tests, secret scan and production build,
- authentication, RBAC and cross-tenant isolation,
- RLS, grants, migration compatibility and application DB role,
- Creator/Studio onboarding and dashboard E2E,
- upload/QC/rights/licensing/buyer/delivery/finance workflows,
- Bridge-authorized LOOP publication, entitlement and playback E2E,
- security, secrets, observability, rollback and environment-variable review,
- Preview runtime/browser verification.

Even if every gate passes, **do not merge or deploy to Production without new explicit user approval for the exact PR/SHA and Production target**. Production remains **HOLD / NOT CERTIFIED / NO-GO** until then.

## 9. Continuous-agent behavior

On every authorized invocation or configured scheduled run:
- reload this file and current user decisions,
- inspect current GitHub/Preview/STAGING state,
- resume unfinished work from the latest verified checkpoint,
- avoid repeating completed work,
- update issues/PRs with evidence,
- stop at approval boundaries.

Do not claim to run continuously between invocations unless a real, user-authorized automation is configured and its schedule/status is verified.

## Final command

**DO NOT JUST REPORT. BUILD IT. REPAIR IT. TEST IT. VERIFY IT. UPDATE IT.**

**Bridge authorizes → LOOP delivers. App-inu pani kittaruthu.**
