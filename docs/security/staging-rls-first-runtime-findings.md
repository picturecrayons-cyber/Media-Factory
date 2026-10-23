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


## Follow-up application authorization review — 2026-10-23

Status: **PARTIAL; catalog inventory re-verified, source review not complete.**

### Fresh read-only catalog result

A read-only query against Staging project bbtrosuwisnxacuxvegt returned exactly 63 public base tables with RLS enabled and no policies. For every one of these tables, effective SELECT/INSERT/UPDATE/DELETE privileges were false for both anon and authenticated. This confirms the current client roles are blocked at the table-grant layer. It does not establish that the server-side SQL connection is least-privileged or that every server function performs correct authorization. No policies or grants should be added merely to clear the advisor findings.

### Source paths verified

- `src/lib/auth/middleware.ts`: server functions obtain a bearer token, enforce same-site request checks, call `requireUser`, and pass verified user ID/email in server context.
- `src/lib/bridge/session.ts`: loads Bridge actor profile by verified identity, resolves identity links, and exposes verified actor / internal-role checks. The identity-link and email-based fallback path needs a focused review before synthetic-user testing.
- `src/lib/bridge/admin-workstations.ts`: admin read/write functions use auth middleware and require a verified actor, internal role and/or named RBAC permission before protected operations.
- `src/lib/loop/profile.ts`: consumer profile, watch progress and singular `loop_watchlist` calls use auth middleware and predicates scoped to `context.userId`. These calls use direct SQL, not the Supabase Data API.
- `src/lib/db.ts`: direct PostgreSQL connection is selected from DATABASE_URL / POSTGRES_URL and uses the database role embedded in that connection. The exact deployed Staging connection target and role have not been proven from source. This remains a critical gate; do not run synthetic-user workflows until runtime isolation is evidenced.
- `src/lib/bridge/env.ts`: reads SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY server-side.
- `supabase/functions/razorpay-webhook/index.ts`: service-role client is used after Razorpay signature validation; code checks provider order binding, event idempotency and payload hash before payment/entitlement/title/audit writes. Needs negative tests for wrong order, duplicate event, conflicting payload and unknown/missing local order. No live payment tests were run.
- Additional table-specific references found: bridge_profiles in session.ts / profiles.ts / admin-workstations.ts; bridge_titles in titles.ts / workflow.ts / admin-workstations.ts; bridge_assets in assets.ts / asset-confirmation.ts / workflow.ts; bridge_loop_publications in loop-publication.ts / loop/catalog.ts; bridge_webhook_events in payments.ts / service-revenue.ts / the Razorpay webhook; loop_profiles, loop_watch_progress and loop_watchlist in loop/profile.ts; streamvista_orders in bridge/streamvista.ts; bridge_language_rights in multilingual-rights.ts; bridge_site_content in site-content.ts; bridge_dmca_registrations in dmca.ts; bridge_buyer_title_access and bridge_title_merge_aliases in duplicate-title-merge.ts.

This is a partial call-site map, not a claim that all 63 tables have been fully traced. The remaining tables must be reconciled against the schema and all source references, with exact functions and authorization predicates recorded before this register can be marked complete.

### loop_my_watchlist() decision

Repository default-branch search for loop_my_watchlist returned no direct source match. The function remains SECURITY DEFINER, with EXECUTE available to authenticated but not anon. A separate application path uses singular loop_watchlist; the function reads plural loop_watchlists. A repository search alone cannot exclude dynamic RPC calls, external callers or stale deployed code. No privilege change and no SECURITY INVOKER conversion were made. Keep the function unchanged until runtime/deployed-client caller evidence is checked; only then consider a reviewed REVOKE EXECUTE proposal if no required caller exists.

### Not performed / remaining blockers

- No synthetic owner, non-owner, anonymous or unauthorized-role tests were run.
- Leaked-password protection remains NOT VERIFIED. Available connected Supabase tools do not provide Auth Dashboard configuration or Auth Admin user lifecycle operations; enable the setting manually in the Staging dashboard and capture evidence.
- Signup, password-change and password-reset tests were not run.
- No migration, grant, policy, function privilege or Auth setting was changed; Security Advisor was not rerun because there was no change to validate.

### Next gate

1. Complete the per-table source-callsite and server-side authorization register; document unused/legacy only after repository-wide evidence.
2. Prove deployed DATABASE_URL / POSTGRES_URL target and connection role without exposing secrets; prove service-role secrets remain server-only.
3. Confirm any deployed or dynamic caller of loop_my_watchlist().
4. After isolation proof, run synthetic negative/positive tests and manually enable/test Staging leaked-password protection.
5. Rerun Security Advisor after approved changes and record the exact result.

**Release gate remains NO-GO — NOT CERTIFIED. Production was not queried or changed.**


### Follow-up gate execution — 2026-10-23 (read-only)

#### Staging catalog re-check

A fresh read-only query against Staging project `bbtrosuwisnxacuxvegt` returned:
- Project status `ACTIVE_HEALTHY`, region `ap-south-1`, PostgreSQL 17.
- Query session identity: `current_user=postgres`, `session_user=postgres`. This identifies the connector SQL session only; it is **not** evidence of the Vercel Preview runtime's database role.
- Exactly 63 public base tables have RLS enabled and no policies.
- Each of those 63 tables reports no effective SELECT/INSERT/UPDATE/DELETE privilege for either `anon` or `authenticated`.
- Fresh function metadata for `public.loop_my_watchlist()`: SECURITY DEFINER, owner `postgres`, fixed `search_path=public, pg_temp`, EXECUTE false for `anon`, true for `authenticated` and `service_role`. No function ACL change was made.

#### Runtime isolation blocker

Read-only Vercel project and Preview environment metadata requests for project `bridge` returned `403 Forbidden`. No environment values were requested/decrypted. Consequently, this review cannot establish the deployed Preview branch's effective `DATABASE_URL`/`POSTGRES_URL` target or embedded database role. Do not infer runtime isolation from the Staging connector query, source code, or project naming. Do not run synthetic-user tests until a project owner supplies verifiable, sanitized Preview-scope evidence tying the deployed commit to the Staging database host/project and the intended least-privileged DB role. Do not expose connection strings or secret values.

#### Source-search additions (default branch at `3b96a07da0b0706515488552d06ecfd3dcb916ea`)

Repository searches found server-side `getSql()` access patterns for:
- `bridge_buyer_title_access`: `src/lib/bridge/duplicate-title-merge.ts`; related migration/policy references also appear in `migrations/0012_bridge_rls_identity_binding.sql`.
- `bridge_dmca_registrations`: `src/lib/bridge/dmca.ts`.
- `bridge_email_challenges`, `bridge_invites`, `bridge_profiles`, `bridge_loop_identity_links`: `src/lib/bridge/profiles.ts`, `src/lib/bridge/session.ts`, and onboarding scripts/tests.
- `bridge_language_rights`, `bridge_license_packages`, `bridge_package_entitlements`: `src/lib/bridge/multilingual-rights.ts`, `src/lib/bridge/payments.ts`.
- `bridge_service_catalog`, `bridge_service_costs`, `bridge_service_invoices`, `bridge_service_order_events`, `bridge_service_orders`, `bridge_service_quote_lines`, `bridge_service_quotes`, `bridge_service_rates`, `bridge_tax_rates`: `src/lib/bridge/service-revenue.ts` and `src/lib/bridge/commercial-admin.ts`; the default branch includes `supabase/migrations/20261007000000_harden_bridge_commercial_server_only.sql`, which revokes browser-role privileges for commercial tables.
- `bridge_site_content`: `src/lib/bridge/site-content.ts`.
- `bridge_title_gate_certifications`: `src/lib/bridge/admin-workstations.ts` and `src/lib/bridge/buyer-visibility.ts`.
- `bridge_title_merge_aliases`, `bridge_title_merge_audits`: `src/lib/bridge/duplicate-title-merge.ts`.
- `bridge_titles`: `src/lib/bridge/titles.ts`, `src/lib/bridge/asset-confirmation.ts`, `src/lib/bridge/admin-workstations.ts`, plus E2E script references.
- `bridge_webhook_events`: `src/lib/bridge/payments.ts`, `src/lib/bridge/service-revenue.ts`, and `supabase/functions/razorpay-webhook/index.ts`.
- `bridge_service_catalog` and related commercial tables use direct SQL in server functions; this source observation is not a substitute for confirming the deployed DB role.
- `config_revisions`, `loc_jobs`: schema/migration references were found; caller/authorization classification remains open.
- `entitlements`, `loop_entitlements`, `loop_profiles`: source references include `src/lib/bridge/payments.ts`, `src/lib/loop/subscriptions.ts`, `src/lib/loop/catalog.ts`, and `src/lib/loop/profile.ts`. `loop_profiles` reads/writes are scoped with `context.userId` in the reviewed snippet.

This is **still a partial register**, not a claim that all 63 tables have been traced. Some searches returned no default-branch result for the table name; absence of a search hit is not proof that a table is unused. Finish a systematic schema-to-source reconciliation, inspect exact function bodies and role guards, and document each of the 63 tables before marking the register complete.

#### Gate outcome

No migration, grant, policy, function privilege, Auth setting, or application data was changed. No synthetic-user or password-flow tests were run. The Vercel 403 blocks runtime isolation proof; Staging leaked-password protection remains NOT VERIFIED. Keep PR #376 Draft and release status `NO-GO — NOT CERTIFIED`. Production project `mlmgugivsyoxzdgwkbpu` was not queried or changed.


#### Source-search supplement for remaining catalog names

Additional default-branch searches at `3b96a07da0b0706515488552d06ecfd3dcb916ea` found:
- `loop_subscriptions`: `src/lib/loop/subscriptions.ts`, `src/lib/loop/catalog.ts`.
- `loop_titles`: `src/lib/loop/catalog.ts`, `src/lib/loop/subscriptions.ts`, `src/lib/loop/profile.ts`, and Bridge publication path `src/lib/bridge/loop-publication.ts`.
- `loop_watch_progress`, `loop_watchlist`: `src/lib/loop/profile.ts`; reviewed query predicates scope records by `context.userId`.
- `profiles`: `src/lib/bridge/profiles.ts`, `src/lib/loop/profile.ts`, and route/UI references. This name is ambiguous across Bridge/Loop/legacy schemas and must be matched by schema-qualified table name.
- `screeners`: `src/lib/loop/catalog.ts` and `src/routes/index.tsx`; the exact table access and authorization must be reviewed.
- `session`, `user`, `verification`: authentication/session source and route references exist, but the generic names also appear in non-table contexts; exact schema-qualified call sites need confirmation.
- `streamvista_jobs`, `streamvista_orders`: `src/lib/bridge/streamvista.ts`; `streamvista_legacy_links` appeared in migration references.
- `submissions`: `src/lib/bridge/submissions.ts`, `src/routes/submit-film.tsx`, `src/routes/onboarding.tsx`.
- `territories`: submission, rights-coverage and workflow-policy references; confirm whether each occurrence is the public table or a domain/type constant.
- `titles`: `src/lib/bridge/titles.ts` and buyer/admin/studio route references; distinguish schema-qualified `bridge_titles`, `loop_titles`, and legacy `titles`.
- `subscriptions`: `src/lib/loop/subscriptions.ts`, `src/lib/loop/catalog.ts`, and legacy/canonical migration references; distinguish `subscriptions` from `loop_subscriptions`.
- `platform_meta`, `qc_jobs`, `revenue_events`, `transfers`: repository results were migration/schema references only in this search pass; do not label them unused until full SQL/source search confirms no dynamic access.

Search results for several other tables in the 63-table inventory returned no exact default-branch hits, including some operational and commercial tables. That absence is not proof of non-use. This register remains **incomplete** until every catalog name is reconciled against schema-qualified SQL, dynamic query builders, all server functions, and migrations; each row must state whether its evidence is application source, migration only, or unresolved.
