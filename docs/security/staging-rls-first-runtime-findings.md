# Staging runtime findings — first remediation gate

Status: **READ-ONLY REVIEW COMPLETE / MIGRATION NOT YET SAFE TO APPLY**
Target project: `bbtrosuwisnxacuxvegt` only. Production project `mlmgugivsyoxzdgwkbpu` was not queried or changed.
Observed: 2026-10-23.

## Verified application call-site finding

The repository's `src/lib/loop/profile.ts` uses server-side `getSql()` behind `authMiddleware` for the consumer watchlist. It reads/writes the singular `public.loop_watchlist` table with `context.userId` in each query. Repository search on the default branch did **not** find a call to `loop_my_watchlist()`.

The existing database function `public.loop_my_watchlist()` is a different path from the confirmed server-side query:
- `SECURITY DEFINER`, owned by `postgres`
- fixed `search_path=public, pg_temp`
- EXECUTE available to `authenticated` and `service_role` (catalog also reports postgres/supabase_admin)
- checks `auth.uid()` against `loop_watchlists.user_id` and filters title publication / territory / window / exploitation-model conditions
- depends on `loop_titles` and `bridge_loop_publications`

**Decision:** Do not convert the function to `SECURITY INVOKER` yet. The caller is not confirmed, and the catalog shows `authenticated` currently has no table grants on `loop_titles`; an invoker conversion without a separately reviewed grant-and-policy design would likely return no rows or break a hidden caller. Do not widen grants just to clear the advisor warning. Next step is to identify whether a client RPC actually calls it and, if not, propose revoking unnecessary EXECUTE after independent review.

## First table candidate: `public.loop_watchlist`

Verified from staging catalog:
- columns: `user_id text NOT NULL`, `loop_title_id text NOT NULL`, `created_at timestamptz NOT NULL`
- RLS enabled, no policy
- table grants reported for `service_role`; no `anon` or `authenticated` table grants were present in the catalog query
- confirmed app access is server-side via `getSql()` and `authMiddleware`, with a per-user predicate in read/insert/delete queries

**Decision:** Do not add a direct Data API policy to this table at this stage. It is currently closed to `anon`/`authenticated` by grants and RLS; a policy alone would not grant access. The server-side caller and database connection role must be verified before deciding whether RLS is the relevant enforcement layer. Keep the service-only pattern unless evidence demonstrates a direct-client use case.

## Why the 63 findings are not a blanket migration

The advisor's `rls_enabled_no_policy` finding is informational for each table. The catalog query shows many such tables have grants only to `service_role`, which is intentionally not exposed to client code. Some tables contain authentication tokens, mail/webhook events, payments, rights, title authorization, entitlements, or audit data. A blanket policy or blanket grant would expand access and is rejected.

## Read-only checks to repeat before a migration

Run `scripts/security/staging_rls_inventory.sql` against the Staging project, then reconcile every advisor finding with:
1. actual role grants and RLS status;
2. source call sites and middleware/authentication;
3. ownership / organization / internal-role relationship;
4. the least-privilege operation needed;
5. synthetic owner, non-owner, anonymous and unauthorized-role tests.

This report is evidence for planning only. It contains no database DDL and does not authorize a migration to be applied.


## Follow-up effective-privilege verification

A fresh read-only catalog check on Staging confirmed:
- Exactly **63** public tables have RLS enabled and no policies.
- Across those 63 tables, effective table privileges are **0 for `anon`** and **0 for `authenticated`** for SELECT/INSERT/UPDATE/DELETE. A second query returned no table with any of those client-role privileges.
- The table-level grants listed by the catalog are for `service_role`. Therefore the 63 Advisor findings are currently INFO-level defense-in-depth notices, not a reason to create client policies or grant client access. **Do not add 63 policies.** Keep the tables closed unless a documented application use case proves a client-facing operation is required.
- `public.loop_my_watchlist()` has ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; effective EXECUTE is false for `anon` and true for `authenticated`. There is no PUBLIC/anon EXECUTE grant in the current ACL. The function is still SECURITY DEFINER and its caller remains unconfirmed, so no privilege change is applied yet.
- `loop_watchlists` (plural) is distinct from `loop_watchlist` (singular). The plural table currently grants authenticated SELECT/INSERT/DELETE and has own-row policies using `auth.uid() = user_id`. The function reads this plural table and joins `loop_titles` and `bridge_loop_publications`; those joined tables show service_role table grants, while authenticated access to publication rows is mediated by the existing SELECT policy. Do not switch the function to SECURITY INVOKER until a caller-specific regression test proves it can still access exactly the intended rows without widening grants.

## First migration decision

**No policy migration is justified by the 63 INFO findings alone.** The first safe implementation is an evidence-led grant/function review, not a blanket policy migration. For `loop_my_watchlist()`, the candidate action is either (a) retain SECURITY DEFINER with narrowly scoped EXECUTE and verified caller/authorization tests, or (b) if source and runtime evidence establish no required caller, prepare a separate reviewed `REVOKE EXECUTE ON FUNCTION public.loop_my_watchlist() FROM authenticated` proposal. Neither action has been applied. A function privilege change is a behavior change and must be staged/tested with synthetic users first.

## Remaining gates

- Finish the table-by-table source-call-site register; effective privilege checks prove the client roles are currently blocked, but do not by themselves prove the service-role application authorization model.
- Establish the function's real caller (repository search on the default branch found no direct call) and test owner/non-owner/anonymous/unauthorized cases in a safe staging test harness.
- Enable leaked-password protection manually in the Staging Auth dashboard and verify signup/password-change/password-reset behavior. It remains NOT VERIFIED.
- Rerun Security Advisor after any approved change and record the exact output.
