# Crayons Bridge — Corrected STAGING ACL Remediation Proposal

**Date:** 03 November 2026\
**Status:** Source-only proposal / independent review required\
**Target:** STAGING / TESTING DB — `jbymleftneggcgutlcqu`\
**Excluded:** PRODUCTION DB — `mlmgugivsyoxzdgwkbpu`\
**No implementation approval is implied by this document.**

## 1. Executive decision

**STAGING: SECURITY REMEDIATION REQUIRED — implementation BLOCKED pending evidence.**

Do not apply a blanket revoke, do not replay existing migrations, and do not create generic `authenticated` RLS policies.

The present evidence establishes that 32 public tables have RLS enabled and no recorded policies. It does not independently establish the complete effective privilege set or prove that operational data was exposed.

The leaked-password protection Advisor finding is explicitly out of scope for this ACL proposal, per the current instruction. It is not treated as an ACL remediation blocker.

## 2. Evidence and confidence

| Finding | Current status | Interpretation |
| --- | --- | --- |
| 32 public Bridge tables | CONFIRMED | STAGING inventory |
| RLS enabled on all 32 | CONFIRMED | RLS is enabled |
| No policies recorded for those tables | CONFIRMED | No row policies currently listed |
| Data exposure occurred | NOT PROVEN | No-policy findings alone do not prove exposure |
| Exact table/column grants | NOT RE-VERIFIED in this review | Requires fresh read-only catalog evidence |
| Sequence privileges | NOT RE-VERIFIED in this review | Requires fresh read-only catalog evidence |
| Function EXECUTE privileges | NOT RE-VERIFIED in this review | Requires effective ACL and ownership inspection |
| Default ACLs / actual migration owners | NOT RE-VERIFIED in this review | Must identify real object creators |
| Leaked-password protection | OUT OF SCOPE | Leave unchanged for this task |

Earlier audit findings about grants, sequences and default ACLs remain historical evidence until independently rechecked. They must not be presented as freshly confirmed by this review.

## 3. Application access model — what source proves

### Browser Supabase client

`src/lib/supabase.ts` creates a Supabase client using a publishable key. This proves that a browser-facing Supabase client exists. It does **not** prove that all 32 operational tables are accessed through the Data API.

Required next source review:

- Find every import and callsite of this client.
- Separate Auth/session operations from `.from()`, `.rpc()`, Storage and other Data API operations.
- Record every table, view, RPC and storage bucket accessed from browser code.
- Confirm whether any operational table is queried or mutated directly by the browser.

### Server PostgreSQL client

`src/lib/db.ts` creates a server-side PostgreSQL pool and explicitly rejects browser execution. It accepts `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL` or `SUPABASE_DATABASE_URL`.

This establishes a server-only database access path in source. It does not yet prove which database a deployed Preview runtime connects to, or which database role owns the connection.

Required runtime evidence:

- Preview environment-to-project mapping.
- Actual connection target and effective database role.
- No production credential or production database target in Preview.
- Server-only credential handling; no privileged database secret in browser bundles.

### Current conclusion

The intended server-authoritative model is plausible, but **the claim that every operational table is server-only is not yet certified**.

No blanket revoke is justified until the callsite and runtime inventories are complete.

## 4. Required 32-table access classification

Every table must receive an explicit classification before any ACL change.

| Classification | Required decision |
| --- | --- |
| Server-only operational | No browser Data API access; server authorization required |
| Narrow browser read | Exact columns, rows, role and policy must be justified |
| Browser write | Exact operation, ownership rule and negative tests required |
| Internal-only | No customer or buyer access; internal RBAC enforced server-side |
| Unused / legacy | Confirm no route, job, trigger or integration depends on it |
| Unknown | BLOCKED; no privilege change until resolved |

The inventory must cover all 32 existing STAGING tables, including profiles, titles, assets, payments, entitlements, rights, QC, legal, financial, audit, invite, webhook and service/commercial tables.

Do not assume all tables share one access model. Do not infer access from table names alone.

## 5. Corrected migration and schema dependency graph

The source migrations must be reconciled against the actual STAGING schema and migration history before any replay.

```
Canonical identity decision
        |
        v
Verify public."user" exists and is the intended identity authority
        |
        v
0007a_identity_links
        |
        +---- requires public."user"(id)
        +---- requires auth.users(id)
        |
        v
bridge_loop_identity_links
        |
        +------------------------------+
        |                              |
        v                              v
0008 Data API lockdown          0009 buyer title access
        |                              |
        |                              v
        |                    bridge_buyer_title_access
        |                              |
        +---------------+--------------+
                        |
                        v
             0012 identity/RLS helpers
                        |
                        v
             0013 helper ACL hardening
                        |
                        v
             Policy/function execution compatibility review

0021 organization model
        |
        +---- bridge_organizations
        +---- bridge_organization_memberships
        +---- bridge_profiles.organization_id
        +---- bridge_titles.owner_organization_id
```

### Known dependency blockers

1. `0007a_identity_links.sql` references `public."user"(id)`. The current STAGING table inventory did not show this relation.
2. `0008_bridge_data_api_lockdown.sql` references `bridge_loop_identity_links`.
3. `0009_buyer_title_access.sql` creates `bridge_buyer_title_access`, which was absent from the reviewed STAGING inventory.
4. `0012_bridge_rls_identity_binding.sql` depends on identity and buyer-access relations; it also references `bridge_loop_publications`, which was absent from that inventory.
5. `0021_bridge_organizations.sql` creates organization and membership tables absent from the reviewed inventory.
6. STAGING's 13 recorded migration entries do not establish that the repository's numbered migration files were applied with matching contents.

**Gate:** No migration replay or schema repair until each dependency, migration checksum, existing object definition and intended identity authority is reconciled.

Never replay a migration merely because its filename is missing from migration history. Never replay `0006_loop_canonical.sql` into this Bridge-only STAGING database as a shortcut.

## 6. SECURITY DEFINER function design — mandatory correction

The current `0012` and `0013` pair needs redesign before use.

- `0012` creates four `SECURITY DEFINER` helpers and grants EXECUTE to `authenticated`.
- `0013` revokes EXECUTE from `PUBLIC`, `anon` and `authenticated`.
- The RLS policies in `0012` call these helpers.

If the policy caller lacks EXECUTE permission, policy evaluation can fail. Revoking EXECUTE from `authenticated` while retaining policies that invoke the functions is not a compatible design.

For each helper, reviewers must establish:

- Whether `SECURITY DEFINER` is genuinely necessary.
- The function owner and whether that owner has `BYPASSRLS`.
- A fixed, safe `search_path` and schema-qualified object references.
- Explicit identity validation using the trusted authentication context.
- Whether the function can be invoked through the exposed Data API.
- The minimum required EXECUTE grant for policy evaluation.
- Whether the function leaks information or permits arbitrary user-controlled lookup.
- Whether moving helpers to a non-exposed schema is appropriate.

Preferred design:

- Keep internal helpers outside exposed API schemas where feasible.
- Do not grant `PUBLIC` or `anon` execution.
- Grant only the minimum execution permission required by the policy execution model.
- Use `SECURITY INVOKER` where it can safely implement the intended access model.
- If `SECURITY DEFINER` is necessary, document and test its owner, privileges, identity checks and fixed search path.

Do not simply revoke `authenticated` EXECUTE and assume policies will continue working. Do not add `SECURITY DEFINER` as a workaround for permission errors.

## 7. Object-specific ACL review — no SQL proposed for execution

Before drafting a migration, collect and review:

1. Table-level privileges for `PUBLIC`, `anon`, `authenticated` and application roles.
2. Column-level grants.
3. Schema `USAGE` and `CREATE` privileges.
4. Sequence `USAGE`, `SELECT` and `UPDATE` privileges.
5. Function EXECUTE privileges, including inherited `PUBLIC` grants.
6. View ownership and `security_invoker` behaviour.
7. Role membership and `BYPASSRLS` attributes.
8. Default ACLs for every actual migration/object-creating owner.
9. Ownership of existing tables, sequences, functions and views.
10. The runtime database role used by the Bridge server.

`TRUNCATE` is not controlled by RLS. It must be checked as an object privilege. Revoking table privileges does not automatically establish that every other access path is safe.

### Default privileges

Do not assume `postgres` and `supabase_admin` are the only migration owners.

Identify the role that actually creates objects in each migration/deployment path. Inspect its default ACLs and the effective ACLs of objects it created.

Any proposed `ALTER DEFAULT PRIVILEGES` must name a verified owner and be limited to the intended schema and object type. It must not silently change unrelated Supabase-managed objects.

## 8. Remediation sequence after separate approval

1. Complete browser Data API callsite inventory.
2. Complete all 32 table classifications.
3. Verify Preview database target and server connection role.
4. Reconcile schema dependencies and migration checksums.
5. Verify table, column, sequence, schema, function and default ACLs.
6. Agree the helper-function execution model.
7. Draft object-specific STAGING migration(s), each with a documented precondition and rollback.
8. Review the migration diff independently before execution.
9. Obtain separate explicit approval for the STAGING write.
10. Apply only to STAGING after approval.
11. Verify effective privileges, policies and application workflows.
12. Keep PRODUCTION unchanged until a separate production review and approval.

## 9. Rollback and regression requirements

Before any approved migration:

- Capture the exact pre-change ACLs, ownership, policies and default ACLs.
- Record the exact objects affected.
- Prepare a reviewed inverse migration for every changed grant or policy.
- Define how to restore application access if a required server or browser path breaks.
- Do not use a blanket `GRANT ALL` as rollback.

Required regression tests:

- Anonymous access denied where intended.
- Authenticated user cannot access another user's records.
- Buyer A cannot access Buyer B's authorized titles or downloads.
- Creator cannot access another creator's private submissions.
- Buyer cannot access QC, legal, rights, finance or publication controls.
- Internal roles retain only their approved functions.
- Payment and webhook processing continue through server-authorized paths.
- Server-side workflows continue using the intended database role.
- No customer-facing page reveals internal DIT cost, finance or confidential operational data.
- Existing login, title submission, QC, delivery and entitlement workflows remain functional.

## 10. Approval gates

| Gate | Current status |
| --- | --- |
| Source-level architecture review | PARTIAL |
| Browser Data API callsite inventory | NOT VERIFIED |
| 32-table access classification | NOT VERIFIED |
| Exact effective ACL inventory | NOT RE-VERIFIED |
| Migration-owner/default ACL proof | NOT VERIFIED |
| Identity dependency reconciliation | BLOCKED |
| SECURITY DEFINER execution model | BLOCKED |
| Object-specific migration and rollback | NOT READY |
| STAGING write approval | NOT GRANTED |
| PRODUCTION authorization | NOT GRANTED |

**Final decision:** Documentation and source review only. No SQL, migration, database write, Auth setting change, deployment, merge or production action is authorized by this proposal.

**STAGING:** SECURITY REMEDIATION REQUIRED — NOT CERTIFIED.\
**PRODUCTION:** HOLD / NOT CERTIFIED / NO-GO.
