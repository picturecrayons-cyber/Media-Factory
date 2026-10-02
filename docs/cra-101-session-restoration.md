# CRA-101: confirmation → session restoration → onboarding

Base: `e00c61178b7ffd193ad56f26bb9e64b74e1794bb` (Media-Factory main).

## Diagnosis

| Boundary | Evidence and finding |
| --- | --- |
| Confirmation callback | `src/routes/auth/callback.tsx` uses `verifyOtp` for token hashes or `exchangeCodeForSession` for PKCE codes, then `getSession` and server-verified `getUser`. Password recovery goes to `/reset-password` with the recovery marker before profile sync. |
| Browser persistence | `src/lib/supabase.ts` enables persistence, auto refresh and URL detection with `crayons-bridge.sb-auth-token`. Supabase SDK `getSession` awaits initialization. The application cache previously bypassed this authority and could retain an expired bearer. |
| Initial onboarding lookup | `useCurrentUserState` previously exposed a user read directly from localStorage while `isPending` was true. Both onboarding and workspace queries enabled on that user without waiting for restoration. |
| Manual refresh | The old helper called refresh without first resolving the session and fell back to `getSession` after refresh failure, potentially returning the stale session. The new helper waits for restoration, requires a refresh token, uses the SDK's current token, and returns null on failed refresh. |
| Profile loading | Queries now wait for auth restoration and key results by user ID. Loading does not trigger a sign-in redirect or fabricate a profile. Missing profile still renders onboarding; failed database queries remain explicit errors. |
| Origin/cookies | Browser signup/resend use `window.location.origin + /auth/callback`; password recovery uses the current origin. Auth is persisted per browser origin in localStorage and sent as a bearer to Bridge server functions, not through legacy auth cookies. `www.crayonspictures.in` and `crayonspictures.in` are distinct storage origins. Vercel confirms both are bound to project `bridge`; cross-origin session continuity and live Supabase redirect allowlist were not tested. |
| Profile/RBAC | `session.ts` resolves `bridge_profiles` and verified identity links; `profiles.ts` creates profiles only via the authenticated onboarding operation, requires confirmed email, and assigns internal roles only from matching unexpired server-side invites. Existing email-verification/link synchronization behavior remains unchanged. Read-only live schema confirms `bridge_profiles` columns match the code. |
| Legacy auth | `auth/middleware.ts` sends the Supabase bearer; `verify.server.ts` verifies `/auth/v1/user`. No Better Auth/session-table fallback is added or used by this path. Legacy files elsewhere in the repository are not certification evidence for this flow. |

These are code-confirmed defects, not proof that every production retry was caused by them. The error screen also handles server/database failures; the wording no longer asserts that email is confirmed or that token refresh is the only problem. Password `invalid_credentials` is a separate recovery issue; existing accounts are preserved.

## Verification

Focused tests cover OTP confirmation persistence across a fresh SDK client, PKCE exchange, successful token rotation, delayed restoration before refresh, missing session/token, failed refresh without stale fallback, and guard/query wiring. Auth API responses and storage are local test doubles; no production Auth/user writes occur.

Local production build, typecheck (after route generation), lint and full tests are required. The generated route tree also gains the already-existing `/admin-cms` route because the base tree was stale; no new CMS behavior is introduced.

Production project read-only: `bridge` / `prj_fT7VTrZMcgP9NutDhPvMhDAPtXNo`, latest observed deployment `dpl_E7Gx2GpiWg4UXXobckPBcCRqzGkF` READY. Shared Supabase `mlmgugivsyoxzdgwkbpu` ACTIVE_HEALTHY. Sampled deployment error logs did not reveal the original onboarding exception; HTTP 200 server-function entries alone do not prove successful profile resolution.

## Release gate

No automatic deploy or promotion is authorized. `vercel.json` suppresses Git-triggered deployments for this issue branch only. An authorized exact-head Preview and confirmed-email/recovery browser verification are still required before production promotion. This PR does not certify live end-to-end recovery, SMTP delivery, valid credentials, or database connectivity.

## 2026-10-02 reconciliation

Draft #52 was reconciled with current `main` at `4f4ae2534d4feaa1f9f0565dd18050d36bd03628` without restoring stale copies of files that have since evolved on main. The focused confirmation → restored session → onboarding regression coverage remains present. Acceptance still requires exact-head CI plus authenticated Preview checks for confirmation, reload/session restoration, valid refresh, and expired-session behavior.
