# Preview Supabase isolation remediation

Status: code changes committed to an isolated branch; not tested, not merged, and not deployed.

## Required environment mapping

- Vercel Preview: `VERCEL_ENV=preview` and all configured Supabase URL aliases must resolve to `https://jbymleftneggcgutlcqu.supabase.co`.
- Vercel Production: `VERCEL_ENV=production` and all configured Supabase URL aliases must resolve to `https://mlmgugivsyoxzdgwkbpu.supabase.co`.
- Local development must explicitly set `BRIDGE_DEPLOYMENT_ENV=preview` or `production` and use the matching URL. Unknown environments fail closed.

The Vite build embeds the deployment environment from `VERCEL_ENV` (or the explicit local override) for the browser client. Do not set a Preview build to `production`, and do not use the Production project URL in Preview.

## Changes on this branch

- Added environment-scoped URL validation with exact HTTPS hostname checks.
- Applied the validator to the browser Supabase client, server-side session verification, Bridge integration configuration, and the Auth API.
- Removed the hard-coded Production URL from the Auth API. It returns HTTP 503 when environment identity or URL configuration is missing or mismatched.
- Added tests for Preview/Production mapping, mismatched aliases, unknown environment, missing URL, non-HTTPS URLs, and lookalike hosts.

## Still required before any release decision

1. Review every caller of `assertCanonicalSupabaseUrl` and other project-specific pins; do not weaken the Production pin without an environment-aware design.
2. Verify the exact Vercel build environment and Preview URL variables in metadata without exposing values.
3. Run the relevant unit tests and typecheck in an approved CI run; no workflow was rerun for this change.
4. Deploy only to Preview after separate approval, then prove runtime project identity and authenticated E2E behavior against the Testing project.
5. Recheck RLS, grants, privileged functions, Storage isolation, and release rollback controls.

No Vercel settings, database objects, secrets, Production resources, or deployments were changed. This branch is not a release certification.
