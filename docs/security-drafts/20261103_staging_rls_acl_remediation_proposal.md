# Crayons Bridge — STAGING-only security remediation proposal

**Status:** Draft / review-only. This document is not an executable migration.
**Environment:** STAGING / TESTING DB only — `jbymleftneggcgutlcqu`.
**Explicit exclusion:** PRODUCTION DB `mlmgugivsyoxzdgwkbpu` — no query, write, migration, Auth change, environment change, deployment or payment is authorized by this proposal.
**Source snapshot reviewed:** `c7c9c81af1d305a9521861d9f5e4e63bf4d10a82`. Reconfirm against the current PR head before implementation.

## Executive decision

**STAGING security gate: FAIL / remediation required.** Do not apply `0012_bridge_rls_identity_binding.sql`, do not run a blanket revoke, and do not execute role-boundary E2E yet.

This PR proposes the reconciliation and safe implementation sequence only. It intentionally contains no numbered migration and makes no database changes. The source-level access design says Bridge is intended to use Better Auth plus server-side RBAC and a server database connection; the implementation path still needs a route-by-route and connection-level proof. The staging catalog currently lacks the identity prerequisites required by the source migrations.

## 1. Environment and observed evidence

| Item | Read-only evidence | Decision |
|---|---|---|
| STAGING / TESTING DB | `jbymleftneggcgutlcqu`, Crayons Projects - Testing DB, ap-south-1 | Correct target |
| PRODUCTION DB | `mlmgugivsyoxzdgwkbpu` | Out of scope; untouched |
| STAGING public base tables | 32, all RLS enabled | Inventory captured |
| STAGING public RLS policies | 0 | FAIL |
| Direct `anon` / `authenticated` table grants | 17 tables; broad DML/DDL-adjacent privileges including TRUNCATE, REFERENCES and TRIGGER | FAIL |
| Direct sequence grants | 5 sequences, USAGE granted to anon and authenticated | FAIL |
| Default ACLs | For both `postgres` and `supabase_admin`, future tables, sequences and functions grant privileges to anon/authenticated | FAIL |
| Supabase Security Advisor | 32 RLS-without-policy findings; leaked-password protection disabled | FAIL / WARN |
| Identity prerequisites | `public."user"`, `bridge_loop_identity_links`, `bridge_buyer_title_access`, `bridge_organizations`, `bridge_organization_memberships` all absent | BLOCKER |
| STAGING migration history | 13 entries, all named `test_only_*` / `test_*` | NOT RECONCILED |

The 32-table inventory is:

`bridge_asset_versions`, `bridge_assets`, `bridge_audit_logs`, `bridge_buyer_interest`, `bridge_destination_packages`, `bridge_email_challenges`, `bridge_entitlements`, `bridge_financial_ledger`, `bridge_invites`, `bridge_legal_cases`, `bridge_payments`, `bridge_profiles`, `bridge_qc_cases`, `bridge_rights_grants`, `bridge_service_catalog`, `bridge_service_costs`, `bridge_service_invoices`, `bridge_service_order_events`, `bridge_service_orders`, `bridge_service_quote_lines`, `bridge_service_quotes`, `bridge_service_rates`, `bridge_service_settlement_lines`, `bridge_service_settlement_rules`, `bridge_story_concept_submissions`, `bridge_tax_rates`, `bridge_title_duplicate_reviews`, `bridge_title_events`, `bridge_title_reconciliation_events`, `bridge_title_reconciliation_snapshots`, `bridge_titles`, `bridge_webhook_events`.

No table, row, identity, title, payment, rights, asset or organization data was changed.

## 2. Migration-history reconciliation

The source snapshot contains numbered migration files through `0021`, including `0007a_identity_links.sql`, `0008_bridge_data_api_lockdown.sql`, `0009_buyer_title_access.sql`, `0012_bridge_rls_identity_binding.sql`, `0013_harden_bridge_rls_helpers.sql` and `0021_bridge_organizations.sql`.

The STAGING history instead contains 13 timestamped entries:

- `test_only_bridge_core_baseline_20261028`
- `test_only_bridge_rls_20260921`
- `test_only_bridge_assets_censor_certificate_20261004`
- `test_only_bridge_commercial_engine_20261006230000`
- `test_only_duplicate_title_reconciliation_20261028`
- `test_only_harden_commercial_server_only_20261028`
- `test_only_commercial_control_plane_20261028`
- `test_only_financial_reversal_hardening_20261028`
- `test_only_commercial_performance_indexes_20261028`
- `test_only_story_concept_submission_20261028`
- `test_bridge_workflow_schema_parity_20261029`
- `test_censor_certificate_metadata_versions_20261029`
- `testing_security_hardening_20261030`

A matching schema object does not prove a source migration was applied; migration names and timestamps do not prove content parity. Produce a per-file checksum/schema-diff ledger before any replay or baseline repair. Never replay `0006_loop_canonical.sql` into this Bridge-only STAGING DB: the related isolation work item warns that its contents include title/publication data writes.

### Hard prerequisites

1. `0007a_identity_links.sql` references `public."user"(id)`; that relation is absent in STAGING.
2. `0008_bridge_data_api_lockdown.sql` references `bridge_loop_identity_links`; it is absent.
3. `0009_buyer_title_access.sql` creates `bridge_buyer_title_access`; it is absent.
4. `0012_bridge_rls_identity_binding.sql` depends on identity and buyer-access tables; those prerequisites are absent.
5. `0021_bridge_organizations.sql` adds organization and membership tables; both are absent.
6. `0012` grants authenticated EXECUTE on helper functions, while `0013` revokes EXECUTE from PUBLIC, anon and authenticated. Since RLS policies in `0012` invoke these helpers, verify PostgreSQL function privilege behavior under the actual API role before considering this pair valid. Do not assume a policy can call a function whose EXECUTE permission is denied to its caller.

**Gate:** do not apply `0012` or `0013` until the identity authority, schema prerequisites, function ACL model and migration ordering are reviewed.

## 3. Intended access architecture

The source comment in `0008_bridge_data_api_lockdown.sql` describes the intended model:

- Better Auth owns application identity and sessions.
- Server-side RBAC authorizes application actions.
- The server uses a privileged server database connection for Bridge operational data.
- Supabase Data API browser roles (`anon`, `authenticated`) are not an authorization surface for Bridge operational tables.
- RLS remains enabled as defense in depth; do not create generic `TO authenticated` policies.

This is the intended architecture, **not yet an independently verified implementation claim**. Before enforcing the boundary, inspect all routes/actions, all database client constructors, connection pool configuration, runtime environment binding and browser bundles. Prove there is no browser-side Supabase Data API access to these tables and that privileged credentials never reach client bundles. Map each route to an authorization function and data-access layer.

The Better Auth identity must be mapped to Bridge's canonical user ID by an explicit verified identity link. Do not use email-only matching, user-editable metadata, organization-name matching or client-supplied role/organization claims. Keep existing account types and internal roles; do not create another Super Admin or identity.

## 4. Proposed remediation SQL — review only, NOT RUN

The following is the candidate privilege-boundary core **only if** the route/client inventory confirms all 32 tables are server-only. It is not a migration file and must not be pasted into the STAGING SQL editor until a separately reviewed migration is approved.

```sql
begin;

-- Candidate only: server-only Bridge public tables.
revoke all privileges on table
  public.bridge_asset_versions,
  public.bridge_assets,
  public.bridge_audit_logs,
  public.bridge_buyer_interest,
  public.bridge_destination_packages,
  public.bridge_email_challenges,
  public.bridge_entitlements,
  public.bridge_financial_ledger,
  public.bridge_invites,
  public.bridge_legal_cases,
  public.bridge_payments,
  public.bridge_profiles,
  public.bridge_qc_cases,
  public.bridge_rights_grants,
  public.bridge_service_catalog,
  public.bridge_service_costs,
  public.bridge_service_invoices,
  public.bridge_service_order_events,
  public.bridge_service_orders,
  public.bridge_service_quote_lines,
  public.bridge_service_quotes,
  public.bridge_service_rates,
  public.bridge_service_settlement_lines,
  public.bridge_service_settlement_rules,
  public.bridge_story_concept_submissions,
  public.bridge_tax_rates,
  public.bridge_title_duplicate_reviews,
  public.bridge_title_events,
  public.bridge_title_reconciliation_events,
  public.bridge_title_reconciliation_snapshots,
  public.bridge_titles,
  public.bridge_webhook_events
from anon, authenticated;

-- Candidate only: browser roles must not consume operational sequences.
revoke all privileges on all sequences in schema public
from anon, authenticated;

-- Future-object ACLs: apply only after confirming these are the actual
-- object-creating owners used by every Bridge migration/deployment path.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all privileges on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all privileges on sequences from anon, authenticated;

commit;
```

**Not included intentionally:** schema USAGE changes, function EXECUTE revokes, PUBLIC ACL changes, views/materialized views, storage policies, Auth configuration, role membership, and default function privileges. Those require a separate object-by-object dependency review. In particular, function EXECUTE revocation can break RLS predicates that invoke helper functions. Never solve this with SECURITY DEFINER shortcuts or broad authenticated grants.

### Verification SQL to run after a separately approved STAGING migration

```sql
-- Direct table privileges remaining for browser roles
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;

-- Direct sequence privileges remaining
select grantee, object_name, privilege_type
from information_schema.role_usage_grants
where object_schema = 'public'
  and object_type = 'SEQUENCE'
  and grantee in ('anon', 'authenticated')
order by grantee, object_name, privilege_type;

-- RLS policy inventory
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Default ACLs for future objects
select defaclrole::regrole::text as owner,
       defaclnamespace::regnamespace::text as schema,
       defaclobjtype, defaclacl
from pg_default_acl
where defaclnamespace = 'public'::regnamespace
order by owner, defaclobjtype;
```

A PASS requires zero unintended direct browser-role privileges, no PUBLIC/inherited bypass, expected default ACLs for every actual owner, and verified server-role connectivity. An empty query alone is not sufficient: include role memberships, schema USAGE, column grants, function ACLs, views, sequences and default ACLs in the audit.

## 5. Role and tenant acceptance matrix

Use dedicated synthetic identities in an isolated test environment only after CRA-128 proves Preview/STAGING isolation and a separate test-data approval is recorded. No existing account is to be repurposed and no real user is to be impersonated.

| Persona | Positive test | Mandatory negative test |
|---|---|---|
| Anonymous | Public unauthenticated pages only | All Bridge operational Data API table/RPC reads and writes denied |
| Unrelated authenticated user | Own account/session only | Cannot enumerate or mutate another profile/title/payment |
| Creator | Own authorized submissions/assets | Cannot access another creator's title or internal review/finance controls |
| Studio | Titles within verified active organization membership | Cannot cross into another Studio or self-assign organization |
| Buyer A | Only explicitly authorized titles/packages and permitted assets | Buyer B data, QC/legal/finance, unlicensed title and out-of-scope rights denied |
| Buyer B | Same isolated contract for Buyer B | Buyer A data and packages denied |
| Vendor | Only assigned delivery job and permitted artifacts | No title-wide rights, buyer/payment/finance or other vendor job access |
| Admin | Explicit internal admin functions | Cannot bypass verified identity, audit logging or protected super-admin-only controls |
| Super Admin | Explicitly approved exceptional control-plane actions | No implicit global bypass; no self-created identity/role or unlogged action |

Add counterparty tests for broadcaster, OTT, distributor, aggregator and ancillary-rights mandates before enabling Buyer licensing. A business capacity label is not an authorization. Every payment, order, entitlement, package and delivery must bind the exact buyer organization and rights mandate.

## 6. Regression gates before any STAGING migration

- [ ] Exact source SHA, migration file list and checksums captured.
- [ ] Migration-history-to-schema parity report approved.
- [ ] Better Auth session create/refresh/revoke/logout paths pass.
- [ ] Onboarding, existing account resolution and invite acceptance pass.
- [ ] Creator, Studio, Buyer, Vendor, Admin and Super Admin route/action tests pass.
- [ ] Title creation, metadata, asset upload/list/download, QC and legal transitions pass using synthetic records.
- [ ] Buyer discovery, package, license, delivery and revocation tests pass.
- [ ] Payment routes remain disabled for this security migration test; no Razorpay order or payment is created.
- [ ] Email and invite sending remain disabled; no Hostinger send.
- [ ] No production OCI bucket or production media path is accessed.
- [ ] Browser bundle scan proves no server secret exposure.
- [ ] Exact-head CI and Preview deployment match; runtime STAGING binding is independently fingerprinted.
- [ ] Negative API/Data API tests pass for every persona.
- [ ] Supabase Security Advisor rerun; all remaining findings explained and accepted or fixed.
- [ ] Independent reviewer signs the exact SQL, rollback and evidence ledger.

## 7. Rollback plan

Because the candidate is privilege-only, rollback must restore the exact pre-change ACL state—not broad grants. Before applying, export and retain a signed, access-controlled snapshot of:
- table and column ACLs, including grantor/grantee/grant option;
- sequence ACLs;
- schema ACLs and role memberships;
- function/procedure ACLs;
- default ACLs for every object owner;
- RLS enabled/forced flags and full policy definitions.

If any regression occurs, stop requests to the affected Preview, restore only the captured grants for the exact prior grantees/objects, rerun the full ACL and role matrix, and keep the STAGING release blocked until independent review. Do not use `GRANT ALL ON ALL TABLES` as a rollback. Do not drop tables, disable RLS, rewrite rows or touch Production.

## 8. Execution boundaries and linked work

- **CRA-128** (Preview/STAGING isolation) is a prerequisite. Its current gate says no synthetic runtime tests until isolation is proven.
- **CRA-160** (multi-buyer organization and mandate isolation) explicitly marks runtime tests NOT AUTHORIZED until CRA-128 is satisfied.
- **CRA-26** (auth/RBAC foundation) remains In Review.
- **CRA-100** is the cross-system release evidence ledger.

This proposal does not override those blockers. The next implementation phase is source-only reconciliation and route/connection inventory. The STAGING migration requires a separate exact-SQL review and explicit apply approval after its preconditions pass.

## Final status

- GitHub proposal: review-only.
- STAGING / TESTING DB: **NOT MODIFIED**.
- PRODUCTION DB: **NOT QUERIED / NOT MODIFIED**.
- Migrations, RLS, grants, Auth, Vercel environment, deployments, payments and mail: **NO CHANGES**.
- Production release decision: **HOLD / NOT CERTIFIED / NO-GO**.

App-inu pani kittaruthu.
