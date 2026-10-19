# Crayons Bridge staging authentication and RLS audit

**Date:** 2026-10-20  
**Scope:** Read-only repository review and read-only catalog/grant inspection of Supabase staging project `bbtrosuwisnxacuxvegt`.  
**Release status:** Production remains on HOLD. No database DDL, policy changes, credentials changes, or deployments were performed.

## Executive summary

Two workstreams were investigated independently.

- **Login:** The reported browser error `net::ERR_INTERNET_DISCONNECTED` is a browser/network-layer failure while calling Supabase Auth. It does not establish invalid credentials, a Supabase outage, or an application code defect. The current repository already delegates password sign-in to `supabase.auth.signInWithPassword`, throws returned SDK errors, and has dedicated session-restoration tests. No login implementation change is justified by the evidence currently available.
- **Staging database security:** The catalog query found **68 public base/partitioned tables**, **34 with RLS disabled**, and **21 RLS-disabled tables with grants to `anon` and/or `authenticated`**. The 21 listed below have broad client-role table privileges including SELECT and mutation privileges. This is a high-priority potential exposure, subject to confirming API schema exposure and effective role privileges. No live remediation was applied.

## 1. Login workstream

Files reviewed:

- `src/lib/supabase.ts`: persisted sessions and automatic token refresh are enabled.
- `src/lib/auth/client.ts`: `signInWithEmail` calls Supabase `signInWithPassword` and propagates SDK errors.
- `src/lib/auth/session-restoration.ts`: waits for persisted session restoration before forced refresh and returns null when refresh fails.
- `src/lib/auth/session-restoration.test.ts`: existing coverage includes confirmation-session restoration, refresh sequencing, missing sessions/tokens, expired refresh tokens, and PKCE exchange/refresh.
- `src/lib/auth/use-current-user.ts` and `src/components/bridge/gate.tsx`: initial user state is pending; protected workspace queries wait for restoration, and auth events supersede stale initial reads.

### Finding and next test

The console log shows a failed browser fetch with `ERR_INTERNET_DISCONNECTED`; no completed HTTP response is shown. Do not change password/session logic based only on this evidence.

After connectivity is restored, capture one Network-panel result for `/auth/v1/token?grant_type=password`:

1. If it remains a browser-level failure, investigate connectivity, DNS, proxy/firewall, VPN, or extensions.
2. If an HTTP response arrives, capture its status and response body with secrets redacted.
3. If sign-in returns a session but the workspace fails, separately test session restoration and `RequireBridge` routing.

No live sign-in, test-suite run, or code patch was performed during this audit. A network failure cannot be reliably reproduced or fixed by changing auth code without the actual network/HTTP evidence.

## 2. Staging RLS/grants findings

Read-only catalog query results:

- Public base/partitioned tables: **68**
- RLS disabled: **34**
- RLS disabled plus client-role grants: **21**
- RLS enabled with an `anon` table grant: **12**
- RLS enabled, `authenticated` grant, and no policy: **7**

### Highest-priority list: RLS disabled and client-role grants present

The following 21 tables have RLS disabled and grants to `anon` and/or `authenticated` in the inspected staging database:

- `bridge_dmca_registrations`
- `config_revisions`
- `entitlements`
- `loc_jobs`
- `loop_entitlements`
- `loop_profiles`
- `loop_subscriptions`
- `loop_titles`
- `loop_watch_progress`
- `loop_watchlist`
- `platform_meta`
- `profiles`
- `qc_jobs`
- `revenue_events`
- `screeners`
- `submissions`
- `subscriptions`
- `territories`
- `titles`
- `transfers`
- `watchlist`

For these tables, the catalog showed broad table privileges for client roles, including SELECT, INSERT, UPDATE, and DELETE (as well as additional table privileges). Because RLS is disabled, row policies do not protect these tables. If the tables are exposed through the configured Supabase API schema and the grants are effective for the API roles, this may permit unauthorized reading or mutation. Treat this as a high-priority risk until verified.

The 12 RLS-enabled tables with `anon` grants need policy-by-policy review; a grant alone does not bypass RLS, but broad grants should be minimized. The 7 RLS-enabled tables with authenticated grants and no policy are also candidates for intended-access review; RLS normally denies row access where no applicable policy exists, but the intended server/client access path must be confirmed.

### Important limitations

- This is staging project evidence, not proof of production configuration.
- Table grants alone do not prove that every table is reachable through PostgREST; confirm exposed schemas and effective privileges before claiming exploitability.
- Catalog state does not show whether data was accessed or changed by an unauthorized party.
- Do not indiscriminately enable RLS or revoke grants. First map each table to intended access patterns, server/service-role use, and existing application queries.

## 3. Remediation sequence (proposed; not executed)

1. **Confirm exposure read-only:** inspect Supabase exposed schemas, effective grants for `anon`/`authenticated`, default privileges, views, RPCs, and any security-definer functions.
2. **Prioritize sensitive records:** profiles, entitlements, subscriptions, revenue events, screening assets, submissions, territories, transfer/job queues, watchlists, and configuration.
3. **Map access per table:** identify legitimate anonymous catalog reads, user-owned rows, internal/admin operations, and service-role-only operations from repository code and migrations.
4. **Prepare narrow migrations:** enable RLS where appropriate; add ownership/role-aware SELECT and write policies; revoke unnecessary client grants; preserve service-role/server workflows intentionally.
5. **Test before applying:** use staging fixtures for anonymous, authorized owner, unrelated authenticated user, internal role, and service role; verify both allowed and denied SELECT/INSERT/UPDATE/DELETE paths.
6. **Apply only after separate authorization:** review the exact migration and rollback plan, apply to staging under approval, rerun regression/security tests, and obtain separate authorization before any production action.

## 4. Execution record

- Repository source reads: completed.
- Staging catalog, RLS flags, policies, and table grants: inspected read-only.
- Authentication code changes: none; no verified code defect established.
- Database policies, grants, or data: unchanged.
- OCI copy, re-upload, overwrite, requeue, retry: not performed.
- Production deployment or release: not performed; Production HOLD remains in effect.
