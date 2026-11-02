# Bridge Creator / Studio RBAC and STAGING DB RLS plan

**Status: REVIEW ONLY — NOT APPROVED FOR APPLICATION**

- Approved Bridge STAGING / TESTING DB: `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB, ap-south-1).
- PRODUCTION DB: `mlmgugivsyoxzdgwkbpu` — explicitly excluded from this plan and all test execution.
- This document is a table-by-table proposal. It does not apply SQL, grants, policies, fixtures, migrations, or configuration.

## 1. Read-only STAGING evidence (2026-11-03)

The STAGING DB inventory contains 32 public Bridge tables. All 32 have RLS enabled, but `pg_policies` returns zero policies. Direct table grants exist for both `anon` and `authenticated` on 17 tables, with SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES privileges. Prior inspection also found direct column grants, sequence privileges and broad default privileges. Therefore **RLS enabled is not a security pass**: with no policies, there is no row-level allow path for browser roles, but the direct ACL surface is still excessive and must be removed object-by-object.

The current STAGING inventory does not contain `bridge_organizations` or `bridge_organization_memberships`. Source migration `0021_bridge_organizations.sql` defines them, but it is not evidence that the migration is applied to this STAGING DB. Do not run Studio membership tests until the schema and approved migration history are reconciled.

The current STAGING DB has no Loop-specific public tables. CRA-138 remains a separate Loop schema planning gate.

## 2. Ownership and relation map

| Object | Current scope columns / relationship | Proposed access boundary |
|---|---|---|
| `bridge_profiles` | `user_id` | Self profile only through authenticated server API; no public profile enumeration |
| `bridge_titles` | `owner_user_id`; source migration adds `owner_organization_id` | Creator: own rows. Studio: own rows plus rows for same verified active organization membership. No direct buyer/private title access |
| `bridge_assets` | `title_id`, `created_by` → titles | Inherit parent-title ownership; private object keys never public |
| `bridge_asset_versions` | `title_id`, `reference_asset_id` | Inherit parent-title ownership; version history read through authorized workspace service |
| `bridge_title_events` | `title_id`, `actor_user_id` | Creator/Studio may receive safe lifecycle progress for owned title; raw audit/event rows remain server mediated |
| `bridge_rights_grants` | `title_id`, `created_by` | Owner may manage/read own draft rights package only; approval, revoke and license status are internal legal actions |
| `bridge_qc_cases` | `title_id`, `asset_version_id` | Raw reviewer findings internal-only; owner sees a minimized QC status/progress DTO |
| `bridge_legal_cases` | `title_id` | Raw legal evidence and reviewer notes internal-only; owner sees minimized legal status/progress DTO |
| `bridge_destination_packages` | `title_id`, `rights_grant_id`, `qc_case_id`, `legal_case_id` | Internal delivery/licensing service only |
| `bridge_story_concept_submissions` | `title_id` | Creator/Studio own submission only; buyer interest/internal notes not exposed |
| `bridge_buyer_interest` | `concept_submission_id` | Internal and authorized buyer workflow only |
| `bridge_service_quotes` | `user_id`, `title_id` | Own quote through server API only; no other creator's quote |
| `bridge_service_quote_lines` | `quote_id` → service quotes | Parent quote scope; server mediated |
| `bridge_service_orders` | `user_id`, `title_id`, `quote_id`, `payment_id` | Own order status only through server API; no delivery trace or finance ledger |
| `bridge_service_order_events` | `order_id`, `actor_user_id` | Safe customer-visible status only; raw events internal |
| `bridge_service_invoices` | `order_id` | Own invoice only through server API if product workflow requires it; never other users |
| `bridge_service_costs` | `created_by`, `order_id` | Internal operations/finance only |
| `bridge_service_rates` | `created_by`, `service_code` | Internal finance/configuration only; expose only sanitized quote output |
| `bridge_service_catalog` | `code` | Sanitized catalog may be returned by server API; raw table not browser writable |
| `bridge_service_settlement_rules` | `created_by`, `title_id` | Finance-only |
| `bridge_service_settlement_lines` | `rule_id`, `order_id` | Finance-only |
| `bridge_financial_ledger` | `title_id`, `service_order_id`, `payment_id` | Finance-only; no Creator/Studio direct access |
| `bridge_payments` | `user_id`, `title_id` | Own payment status through server API only; no browser mutation |
| `bridge_entitlements` | `user_id`, `title_id` | Own entitlement status only through server API; scope and expiry rechecked |
| `bridge_tax_rates` | `created_by` | Server-only configuration; sanitized calculation output only |
| `bridge_audit_logs` | `actor_user_id` | Internal audit service only |
| `bridge_email_challenges` | `user_id` | Auth/server-only |
| `bridge_invites` | No direct owner column in current compact inventory | Server-only invite workflow; verify invite recipient/organization constraints before policy design |
| `bridge_webhook_events` | No direct owner column | Server-only webhook processing; no browser role access |
| `bridge_title_duplicate_reviews` | `candidate_title_id`, `canonical_title_id`, `reviewer_id` | Internal duplicate-review workflow only |
| `bridge_title_reconciliation_events` | `review_id`, `actor_user_id` | Internal reconciliation audit only |
| `bridge_title_reconciliation_snapshots` | `review_id` | Internal reconciliation only |

Foreign-key inventory was read from STAGING information_schema. Child records with `title_id` should derive access from the parent title, not trust a caller-supplied `created_by` or a duplicated owner field. Child rows without a direct title FK must inherit access through their parent FK (quote, order, review, or package).

## 3. Proposed role matrix

| Capability | Creator | Studio active member | Buyer | Internal reviewer / finance | Admin / Super Admin |
|---|---:|---:|---:|---:|---:|
| List/read own private titles | Own only | Own + same org only | No | According to explicit staff permission | Explicit staff permission |
| Update own title metadata | Own, draft/preparing only | Same org, draft/preparing only | No | No implicit owner mutation | Explicit title permission |
| Upload/read private assets | Own only | Same org only | Entitled delivery only | QC/legal signed access as scoped | Explicit permission |
| Read safe review progress | Own only | Same org only | No | Yes, according to desk | Yes |
| Read raw QC/legal evidence | No | No | No | QC / legal role only | Explicit permission |
| Create rights draft | Own title only | Same org title only | No | Legal reviewer reviews, not owner bypass | Explicit permission |
| Approve QC / legal | No | No | No | Separate QC / legal role | Explicit permission |
| Delivery trace / delivery finance | No | No | No | Explicit delivery / finance role only | Explicit permission |
| Finance ledger / settlement | No | No | No | Finance role only | Explicit permission |
| Publish / revoke Loop | No | No | No | No | Explicit `loop.publish` / `loop.revoke` |
| Invite internal users / grant staff roles | No | No | No | No | Existing explicit role-grant matrix only |

**Separation rule:** account type never widens an internal role. Creator/Studio permissions must not include `delivery.read`, `delivery.read_finance`, `finance.read`, or `finance.record_settlement`.

## 4. Proposed additive STAGING migration sequence (not executable yet)

1. Reconcile exact applied migration history and the missing Studio organization tables on STAGING. Do not infer org identity from `organization_name`; do not backfill existing titles automatically.
2. Produce a per-object ACL diff covering table grants, column grants, sequences, schema usage, default privileges for every owner, function EXECUTE ACLs, views, and triggers. No blanket schema-wide grant/revoke without dependency proof.
3. Remove direct browser-role privileges from server-only financial, legal, QC, webhook, audit, delivery and reconciliation objects. Keep browser Data API exposure only for a deliberately documented endpoint/table pair.
4. For each exposed table, pair least-privilege table grants with RLS policies. Do not mistake `TO authenticated` for ownership authorization.
5. Creator/Studio title policies must use `auth.uid()::text` matched to `owner_user_id`, plus verified profile and explicit active Studio membership for organization-scoped rows. Studio membership must be read through a non-recursive, reviewed design. Never use editable `user_metadata`, email-domain, organization-name or caller-supplied organization IDs.
6. Child policies must use EXISTS against the parent title and the same owner/org predicate. UPDATE policies require both `USING` and `WITH CHECK`. No DELETE/TRUNCATE for Creator/Studio.
7. Keep raw QC/legal/finance/delivery/audit/package/webhook rows server-only. Return only purpose-built, minimized workspace DTOs for progress.
8. Assess whether FORCE ROW LEVEL SECURITY is compatible with the actual server DB role before enabling it. The application currently uses a trusted server-side SQL connection; forcing RLS without a tested server identity/session context could break workflows or produce misleading coverage.
9. Run Supabase Security Advisor, table/column/sequence/function ACL snapshots, and role-based negative/positive tests. Capture before/after evidence and rollback script.

No policy SQL is included here intentionally: the exact server connection role, grants, membership schema and API access pattern must be proven before writing policy expressions.

## 5. Required synthetic test cases

- Creator A can list/read/update/upload only Creator A's own title and assets.
- Creator A cannot read/update Creator B's title, title events, rights grant, asset metadata, asset versions, screener or private evidence.
- Studio A owner/member can access Studio A titles only with active membership; Studio B and removed/suspended members are denied.
- Studio cannot read another organization's titles even if organization display names match.
- Buyer cannot access private workspace, QC/legal/finance/delivery rows or unlicensed title assets.
- QC reviewer cannot grant rights or read finance; legal reviewer cannot perform QC; finance cannot change title/QC/legal state.
- Internal `viewer` cannot inherit Creator powers; `admin` cannot silently become Super Admin; no duplicate Super Admin or identity.
- UPDATE cannot reassign `owner_user_id` or `owner_organization_id`; no DELETE/TRUNCATE.
- Missing profile, unverified email, missing organization schema, inactive membership and null owner scope all fail closed.
- Child FK references cannot be used to cross title or organization boundaries.
- Public/anon role has no private data access; authenticated role has only deliberately granted endpoints and row scope.

## 6. Preview / rollout gates

- Run unit and source regression tests on exact PR head.
- Run the STAGING DB smoke only after the project ref and database hostname prove `jbymleftneggcgutlcqu`, and after the migration/schema/ACL prerequisites are reviewed.
- The smoke must assert RLS policies and ACL safety before inserting synthetic fixtures; all fixtures must be transactionally rolled back.
- Prove exact Vercel Preview deployment SHA and server-side DB ref; no Production DB or Production credentials.
- No Production merge, deploy, DB change, Auth change, title mutation, real email, payment or Loop publication under this plan.

**Release decision: PRODUCTION HOLD / NOT CERTIFIED / NO-GO.**
