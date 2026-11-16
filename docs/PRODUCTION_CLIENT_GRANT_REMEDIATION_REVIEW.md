# Production client-grant remediation — review package

**Status:** feature-branch proposal only. Not applied to STAGING or PRODUCTION.

## Evidence captured from PRODUCTION (READ-ONLY)

Project: `mlmgugivsyoxzdgwkbpu`, PostgreSQL 17.6.1.166.
Migration history: 65 recorded migrations, including the prior lockdown and deny-policy migrations.

The current grant/policy cross-check identified:
- `bridge_creator_notifications`: broad anon/authenticated table grants plus an explicit deny-all client policy.
- `bridge_title_merge_aliases` and `bridge_title_merge_audits`: broad grants plus explicit no-client-access policies.
- `loop_media_migration_queue`: broad grants plus an explicit deny-all client policy.
- `bridge_deals`, `bridge_delivery_jobs`, `bridge_production_assets`, and `bridge_story_concept_submissions`: authenticated role-scoped policies exist; do not blanket-revoke their row-operation grants without workflow tests.
- Legacy `orders`, `titles`, and `user_entitlements`: broad grants and no RLS policies were observed. Their application references and intended status need a separate trace. This proposal deliberately does not change them.

## Proposed change

Migration `20261116120000_harden_client_table_grants_for_explicit_deny_policies.sql`:
1. Removes only non-row privileges (TRUNCATE, REFERENCES, TRIGGER) from anon/authenticated on public tables.
2. Revokes all table privileges only where an explicit RLS policy proves both anon and authenticated are denied for all commands.
3. Uses transaction guards to abort if either targeted class of unsafe grant remains.
4. Does not alter RLS policies, data, service_role grants, payment rows, title rows, rights, or publication state.

## Mandatory validation before any database apply

- Replay migration against a disposable PostgreSQL 17 database seeded with representative policies and grants.
- Assert deny-all tables have no anon/authenticated table grants.
- Assert owner/buyer policy tables retain their existing row-operation grants and policies.
- Assert server/service role grants remain unchanged.
- Assert rollback on deliberately injected conflicting state.
- Separately trace legacy `orders`, `titles`, `user_entitlements` usage before proposing any grant/policy change.
- Review exact diff and approve STAGING application separately.

## Safety ledger

| Environment | Action | Access | Risk |
|---|---|---|---|
| STAGING DB `jbymleftneggcgutlcqu` | No apply | NONE | No change |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | READ-ONLY evidence only | READ-ONLY | HOLD / NO-GO |
| GitHub | Proposal branch and Draft PR | WRITE — feature branch only | Review required |
| Vercel | No deployment | NONE | No change |

**Production remains HOLD / NOT CERTIFIED / NO-GO. ₹0. App-inu pani kittaruthu.**
