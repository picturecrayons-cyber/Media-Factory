# Bridge Testing DB — RLS / Role Access Reconciliation

**Status:** BLOCKED — evidence inventory only; no policy/grant recommendation is approved for application.  
**Scope:** `picturecrayons-cyber/Media-Factory`, branch `chore/staging-readonly-schema-audit-20261110`, commit baseline `7cfc06e95d9ffe2346951450f121da309c815e07`.  
**STAGING DB:** Crayons Projects - Testing DB, project `jbymleftneggcgutlcqu`.  
**PRODUCTION DB:** Out of scope; HOLD / NOT CERTIFIED / NO-GO.  
**Action:** READ-ONLY catalog and source review. **Access:** READ-ONLY. **Risk:** No database writes, grants, policies, migrations, storage writes, merge, or deployment performed.

## 1. Verified STAGING inventory

Read-only catalog queries returned:

| Check | Result |
|---|---:|
| Public tables | 47 |
| Public tables with RLS enabled | 47 |
| Public tables with RLS disabled | 0 |
| Public tables with no RLS policy | 37 |
| Public tables with at least one RLS policy | 10 |
| `anon` / `authenticated` table grants | 0 |
| Applied migration records | 31 |

The 37 no-policy tables are not automatically a browser data exposure: the same catalog audit found no table privileges granted to `anon` or `authenticated`. RLS is enabled on all 47 public tables. The missing policies still matter if a future change grants browser-role table access, and may also matter to privileged/server query behavior depending on the connection role and execution path. Do not add blanket policies.

The 10 tables with existing policies are:
- `bridge_asset_versions` — authenticated INSERT / workspace SELECT
- `bridge_assets` — authenticated INSERT / workspace SELECT
- `bridge_buyer_title_access` — authenticated self/admin SELECT
- `bridge_organization_memberships` — authenticated self/admin SELECT
- `bridge_organizations` — active member/admin SELECT
- `bridge_profiles` — self/admin SELECT
- `bridge_story_concept_submissions` — authorized INSERT / workspace SELECT
- `bridge_title_events` — owner INSERT / workspace SELECT
- `bridge_title_submission_intake` — owner INSERT / owner UPDATE / workspace SELECT
- `bridge_titles` — authorized SELECT / eligible creator or studio INSERT

The 37 public tables without policies are:
`bridge_audit_logs`, `bridge_buyer_interest`, `bridge_channel_payment_schedule`, `bridge_channel_statement_lines`, `bridge_destination_packages`, `bridge_email_challenges`, `bridge_entitlements`, `bridge_financial_ledger`, `bridge_invites`, `bridge_language_rights`, `bridge_legal_cases`, `bridge_license_packages`, `bridge_loop_identity_links`, `bridge_loop_publications`, `bridge_package_entitlements`, `bridge_payments`, `bridge_qc_cases`, `bridge_rights_grants`, `bridge_service_catalog`, `bridge_service_costs`, `bridge_service_invoices`, `bridge_service_order_events`, `bridge_service_orders`, `bridge_service_quote_lines`, `bridge_service_quotes`, `bridge_service_rates`, `bridge_service_settlement_lines`, `bridge_service_settlement_rules`, `bridge_story_concept_idempotency`, `bridge_story_concept_mandates`, `bridge_tax_rates`, `bridge_title_duplicate_reviews`, `bridge_title_gate_certifications`, `bridge_title_reconciliation_events`, `bridge_title_reconciliation_snapshots`, `bridge_webhook_events`, `loop_titles`.

The Security Advisor reported 45 `rls_enabled_no_policy` findings: 37 public-schema tables above plus 8 `bridge_private` tables. It also reported leaked-password protection disabled. These are advisor findings, not proof that 45 tables are publicly readable. Remediation requires a table-by-table access design.

## 2. Existing access boundary

Migration `0008_bridge_data_api_lockdown.sql` documents the intended architecture: Bridge application requests are authenticated and authorized in the server runtime, while browser roles `anon` and `authenticated` are revoked from Bridge operational tables. Current STAGING catalog evidence is consistent with that boundary: zero `anon` / `authenticated` table grants.

The source code in `src/lib/bridge/rbac.ts` implements application permissions for:
- Account types: `independent_creator`, `studio`, `buyer`, `investor`.
- Internal roles: `viewer`, `qc_reviewer`, `legal_reviewer`, `finance`, `admin`, `super_admin`.
- Creator and Studio have the same owner-scoped permission set in this file; Studio sharing is conditional on a server-resolved organization match.
- Buyer has catalog / payment-order / own-entitlement permissions; Investor has own-entitlement read.
- Internal staff role permissions are selected instead of account-type permissions; a staff profile does not inherit Creator powers merely from its account type.
- `canAccessDashboard` is limited to verified `super_admin`; `workspaceHome` routes Creator, Studio, Buyer, and Investor to their respective workspaces.
- There is no explicit DIT role in the current `InternalRole` permission map. DIT access must not be inferred from Admin, QC, or Creator roles.

The current `src/lib/bridge/session.ts` resolves Bridge identity server-side, loads profile data, and conditionally resolves a Studio organization scope. The application database adapter uses server-side SQL. These server-side checks must be reconciled with database policies; application RBAC and database RLS are separate enforcement layers.

## 3. Critical schema / RBAC mismatch: multi-Studio membership

The checked-in migration `migrations/0021_bridge_organizations.sql` currently:
- Gives `bridge_profiles` a single nullable `organization_id`.
- Gives `bridge_titles` an `owner_organization_id`.
- Adds a partial unique index `bridge_organization_memberships_one_active_org_per_user` on `user_id` where status is active, enforcing at most one active Studio organization per user.
- Comments that an account can have only one active Studio organization.

The current session actor also carries a single `organizationId`, and the organization lookup is joined through `bridge_profiles.organization_id`.

This conflicts with the product access requirement that one user may be a member of multiple Studio organizations, with each membership separately approved and scoped. It is a **functional schema/RBAC blocker**, not a reason to loosen RLS. A future code/schema proposal must model membership as the authoritative many-to-many relation and resolve a specific organization context per request. It must not infer organization identity from `organization_name`, silently select an arbitrary membership, or allow cross-Studio access. No migration or code change for this redesign is included here.

## 4. Table-by-table access intent — proposal only

This is a planning matrix, not an authorization grant. All rows remain server-only unless a separately reviewed browser use case is approved.

| Data family | Expected application actors / operations | Current disposition |
|---|---|---|
| Profiles, organizations, memberships, identity links | Self profile read; separately approved Studio membership context; Admin support; identity link strictly server-maintained | Keep browser table grants revoked. Existing narrow SELECT policies do not grant table privileges. Multi-Studio model BLOCKED. |
| Titles, assets, asset versions, title events, submission intake | Creator/Studio own-title create/read/update; active members only within selected Studio; QC/DIT workflows only through explicit assigned server actions; Admin/authorized staff review | Existing limited policies on some tables; no blanket grants. DIT assignment/role model NOT VERIFIED. |
| QC cases, legal cases, rights grants/evidence, language rights, destination packages, gate certifications | Assigned QC reviewer, Legal reviewer, authorized Admin; Creator/Studio submit evidence but cannot self-approve; Loop publication only after Bridge authorization | Server-only fail-closed actions; missing table policies do not justify direct browser grants. |
| Buyer interest, buyer title access, license packages, package entitlements, story-concept mandates | Buyer sees only explicitly authorized title/package/mandate data; Investor sees only explicitly granted investment entitlement; Admin controls grants | Keep grants revoked; verify buyer/org scope and expiry/revocation predicates before any policy. |
| Payments, entitlements, financial ledger, service orders/quotes/invoices/settlements, channel statements/schedules, tax/rates/costs | Finance and Admin through server-side audited operations; user sees only own payment/entitlement summary where explicitly allowed | Financial mutations and settlement data remain server-only. No broad Finance policy. |
| Audit logs, webhook events, email challenges, invites, idempotency and reconciliation records | Internal audited server operations; only narrowly authorized audit read; webhook and challenge records never browser-readable | Keep browser grants revoked. No generic authenticated SELECT/INSERT/UPDATE policy. |
| `loop_titles`, Loop publications | Loop read/playback only after Bridge-issued publication and entitlement checks; publication mutation by authorized Bridge server process | Bridge remains authority; no direct browser grants or policy broadening. |

## 5. Function and schema privilege observations

- `public` schema USAGE is present for `anon` and `authenticated`; this does not itself grant table SELECT/INSERT/UPDATE.
- `bridge_private` schema USAGE is present for `authenticated`, not `anon`.
- The current `bridge_private` helper functions (`current_user_id`, `current_internal_role`, `is_admin`, `is_staff`, `can_read_title`, `can_read_workspace_title`, `can_manage_title`) are SECURITY DEFINER and executable by `authenticated`, but not `anon`. Their function bodies, fixed search paths, ownership, and intended exposure require a dedicated security review before any browser grants are considered.
- `public.bridge_duplicate_title_loop_release_allowed(text)` is SECURITY DEFINER but currently not executable by `anon` or `authenticated`; it is executable by `service_role`.
- Do not add SECURITY DEFINER functions to solve access failures. Review each function body, search_path, owner, EXECUTE ACL, and data returned.

## 6. Migration / audit-script status

- STAGING has 31 applied migration records. The inventory includes the identity-link reconciliation, workspace RLS, data API lockdown, function EXECUTE hardening, and organization-related migration history; exact source-to-applied migration parity still needs a version/name/hash reconciliation.
- Migration `0021_bridge_rights_evidence_verification` is not confirmed applied and must remain unapplied until separately approved.
- Supabase development branch `main` reports `MIGRATIONS_FAILED`; Preview project status `ACTIVE_HEALTHY` does not prove Vercel Preview binding or authenticated application E2E.
- The branch package script maps `npm run audit:staging-schema:readonly` to `node scripts/staging-schema-audit-readonly.mjs`. The script enforces the canonical project ref, checks the URL/host, opens `BEGIN READ ONLY`, runs catalog SELECTs, and rolls back. The command has **not** been executed in the repository runtime in this session because the checkout and database credentials are unavailable. Do not label that npm command PASS.
- The branch `chore/staging-readonly-schema-audit-20261110` has no matching PR found in this inspection and no PR-triggered workflow run was returned for the cited commit. The direct Supabase MCP catalog queries are READ-ONLY evidence, not a successful execution of the npm audit command.

## 7. Required next gates

1. Reconcile all 31 applied migration versions/names against the branch's migration files and expected schema. Record missing, extra, duplicate, and out-of-order migrations.
2. Resolve the multi-Studio membership contradiction before defining Studio RLS predicates.
3. Confirm the actual runtime DB role used by Bridge server connections and whether it bypasses RLS; distinguish it from browser `anon` / `authenticated` roles.
4. Review every `bridge_private` SECURITY DEFINER function, including fixed `search_path`, owner, execute ACL, and exact returned data.
5. Produce per-table read/write actor-operation rules for Creator, Studio, Buyer, Investor, Admin, QC, Legal, Finance, and DIT; DIT must have an explicit assignment and permission model.
6. Add tests for cross-Studio denial, multi-Studio context selection, revoked/suspended membership, self-review denial, Buyer entitlement expiry/revocation, Investor scope, Finance isolation, and DIT assignment.
7. Only after these gates, prepare a separate Draft migration/policy proposal. Do not apply it to STAGING or PRODUCTION without distinct approval.

## 8. Explicit non-actions

No STAGING DB schema/data/policy/grant change; no migration apply; no Production connection or operation; no merge; no deployment; no Preview promotion; no live payment/email action. Production remains **HOLD / NOT CERTIFIED / NO-GO**.

**Release status: BLOCKED — NOT CERTIFIED.** App-inu pani kittaruthu.
