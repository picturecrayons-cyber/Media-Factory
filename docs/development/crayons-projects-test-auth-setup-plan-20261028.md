# Crayons Projects Testing DB — Auth and Protected Routes Plan

Date: 2026-10-28

## Target and boundary

- Dedicated test Supabase project: `jbymleftneggcgutlcqu`
- URL: `https://jbymleftneggcgutlcqu.supabase.co`
- The existing canonical repository is `picturecrayons-cyber/Media-Factory`.
- Crayons Bridge uses TanStack Start + React and already has Supabase email/password sign-up, login, email confirmation, password recovery, logout, and server-function middleware which verifies a bearer token using Supabase Auth's `/auth/v1/user` endpoint.
- Production Supabase project `mlmgugivsyoxzdgwkbpu`, production Vercel project `bridge`, production configuration, data, and migration history must not be changed.

## Important compatibility finding

The repository's shared `src/lib/supabase.ts` reads `VITE_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`; `src/lib/auth/verify.server.ts` resolves the same aliases. The canonical production guard in `src/lib/bridge/canonical.ts` deliberately rejects non-canonical Supabase project refs. Therefore, do not simply set the test URL in the existing Production or ordinary Preview environment, and do not weaken the canonical guard. A test-only implementation needs a test-scoped app configuration or isolated test harness which is explicit about the test project and cannot be promoted to production by accident.

## Scope

1. Inspect current auth flows before editing. Reuse the existing Supabase Auth implementation rather than introducing a second auth stack.
2. Use email/password with email confirmation as the first test path. Passwordless email is out of scope unless separately requested.
3. Test sign-up, confirmation callback, login, session refresh/restoration, logout, expired/invalid-session handling, safe internal redirect, and unauthenticated server-function rejection.
4. Protected access must be enforced on the server through verified Supabase identity and server-side authorization. Client-side route redirects are UX only and must not be treated as authorization.
5. No application database tables should be added merely to enable basic Auth. Profile/organization/role schema is a separate design decision.
6. Since the test project previously received a partial Bridge migration smoke run, it is not empty; do not reset or re-run DDL as part of Auth setup.

## RLS/data protection

The test project needs explicit ownership policies for any application tables that are subsequently introduced. Do not treat RLS enabled without policies as proof of safety. Verify grants and RLS policies independently. Existing partial-smoke findings include direct SELECT grants to browser roles on `bridge_titles` and `bridge_payments`, a SECURITY DEFINER RPC executable by `anon`/ `authenticated`, and four unindexed foreign keys. These remain separate blockers for any claim of schema security certification.

## Test-only configuration checklist

- Configure a separate non-production test execution environment; never reuse or override the `bridge` Production env.
- Provide only the test project's URL and its publishable key, never a secret/service-role key in browser bundles.
- Make CI fail closed unless the configured project ref exactly equals `jbymleftneggcgutlcqu` and is not `mlmgugivsyoxzdgwkbpu`.
- Validate callback/redirect allowlist for the dedicated test origin before interactive email tests.
- Run static checks and tests; inspect changed files and workflow logs. No actual account signup or email delivery should be claimed unless exercised against the test project with an authorized test mailbox.
- Do not enable a database write workflow, run migrations, merge this work, or deploy from this plan.

## Current result

This commit records the implementation approach and safety requirements only. It does not change application runtime code, project credentials, database schema, Auth settings, GitHub environments/secrets, or deployments. Implementation must proceed through a reviewed follow-up once a safe test-only app config is agreed and available.
