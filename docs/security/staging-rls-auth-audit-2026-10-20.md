# Crayons Bridge staging authentication and RLS audit

**Date:** 2026-10-20  
**Scope:** Repository review and staging Supabase catalog inspection for project `bbtrosuwisnxacuxvegt`.  
**Release status:** Production remains on HOLD. A fail-closed RLS/grant lockdown was applied to staging only. No production database changes or deployments were performed.

## Executive summary

Two workstreams were handled independently.

- **Login:** The reported browser error `net::ERR_INTERNET_DISCONNECTED` is a browser/network-layer failure while calling Supabase Auth. It does not establish invalid credentials, a Supabase outage, or an application code defect. The current repository delegates password sign-in to `supabase.auth.signInWithPassword`, propagates SDK errors, and has session-restoration tests. No login code change is justified by the evidence currently available.
- **Staging database security:** Before remediation, 68 public base/partitioned tables were inspected; 34 had RLS disabled, and 21 of those had broad grants to `anon` and/or `authenticated`. A staging migration enabled RLS on all 34 previously unprotected tables and revoked all table privileges from client roles on the 21 tables with broad grants. Post-change catalog verification confirmed all 34 target tables have RLS enabled, zero public base/partitioned tables remain with RLS disabled, zero RLS-disabled tables have client grants, and the 21 targeted tables have no client SELECT or INSERT privileges.

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

No live sign-in or authentication test-suite run was performed. No auth code patch was made because the supplied browser error does not establish a code defect.

## 2. Staging RLS/grants findings and executed containment

### Pre-change finding

The staging catalog and Supabase security advisor identified 34 public base/partitioned tables with RLS disabled. Of these, 21 had broad `anon` and/or `authenticated` grants, including SELECT and mutation privileges:

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

Six other unprotected Bridge tables had existing policies that were inactive because RLS was disabled. The migration enables RLS on all 34 previously unprotected tables, activating those existing policies. Tables without a policy default-deny client row access.

### Staging migration applied

Migration name: `staging_public_rls_lockdown_20261020`

Repository migration file: `migrations/0013_public_rls_lockdown.sql`

Actions applied to staging only:

1. Enabled RLS on all 34 tables that were reported with RLS disabled, including tables with pre-existing policies.
2. Revoked all table privileges from `anon` and `authenticated` on the 21 tables listed above. This deliberately removes direct client/Data API table access pending explicit per-table access design.
3. Added no permissive policies. Tables without a reviewed policy remain default-deny for client row access.

### Post-change verification

A read-only catalog query after applying the migration returned:

- Public base/partitioned tables with RLS disabled: **0**
- RLS-disabled tables with client-role grants: **0**
- Targeted 21 tables with client SELECT or INSERT privileges: **0**
- The 34 previously unprotected tables with RLS enabled: **34**

The Supabase security advisor no longer reported the earlier `rls_disabled_in_public` or `policy_exists_rls_disabled` findings in the returned result. It now reports expected informational `rls_enabled_no_policy` findings for tables with no policy; those are intentionally default-deny until their required access model is designed. Other unrelated advisor warnings remain.

### Operational impact and limitations

- This is staging evidence, not proof of production configuration.
- The lockdown intentionally blocks direct client access to the 21 affected tables, including any legitimate legacy direct Data API use. The repository search found no normal application `supabase.from(...)` reads for these tables, but a full end-to-end application regression suite was not run. Verify the key app journeys before any release.
- Server-side database access uses a separate privileged path and is not proven by the catalog checks alone. Test it end-to-end before any rollout.
- Table/grant changes do not prove that data was previously accessed or changed by an unauthorized party.
- No production migration or deployment has been run.

## 3. Remaining remediation and validation

1. Map the intended API access for each table, including any legacy public catalog read requirements.
2. Add only narrow policies/grants for explicitly required direct client paths. Do not use `TO authenticated` alone as authorization; bind user-owned rows to the authenticated identity and use trusted role data for staff access.
3. Test staging as anonymous, authorized owner, unrelated authenticated user, internal role, and service role; cover SELECT/INSERT/UPDATE/DELETE and server-side workflows.
4. Re-run security advisors and application regression tests after the access model is completed.
5. Obtain separate authorization before applying any production migration or deploying. Production remains on HOLD.

## 4. Execution record

- Repository source reads: completed.
- Staging catalog, policies, grants, and security advisor: inspected.
- Staging RLS/grant lockdown: **applied and verified**.
- Authentication code changes: none; no verified code defect established.
- Authentication end-to-end tests: not run; need actual Network-panel evidence.
- Production database changes or deployment: none.
- OCI copy, re-upload, overwrite, requeue, retry: not performed.
- Production HOLD: remains in effect.
