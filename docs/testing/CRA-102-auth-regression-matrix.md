# CRA-102 Authentication Regression Matrix

Run this matrix only against an isolated non-production Preview project with test accounts and test inboxes. Never use production credentials, production users, or production callback URLs for destructive tests.

## Automated checks

Run:

```sh
npm run test:cra101
npm run test:cra102
npm test
npm run typecheck
npm run check:auth
```

Record command output and the exact commit SHA in the PR before requesting review.

## Preview-only manual scenarios

| Area | Scenario | Expected result | Evidence |
|---|---|---|---|
| Signup | Valid new test account | Signup succeeds; confirmation-required state is shown when email confirmation is enabled | Redacted screenshot and Preview URL |
| Signup | Password and confirmation mismatch | Account creation is not called; inline validation is shown | Test result |
| Signup | Duplicate test email | User receives safe sign-in/recovery guidance; no duplicate profile is created | Redacted result and test user ID hash |
| Signup | Confirmation required | Confirmation email is requested; UI does not claim the account is verified yet | Redacted email metadata |
| Login | Valid credentials | Session restored and user reaches authorized home | Route and role |
| Login | Invalid credentials / unverified email | Clear error; no privileged route is entered | Redacted error |
| Redirect | Internal `next` path | Navigates only to an intended internal route | Input and final path |
| Redirect | External, `//host`, or backslash path | Unsafe destination is rejected; user stays on a safe internal destination | Input and final path |
| Confirmation | OTP link | OTP verified, user identity checked, session persisted | Redacted callback result |
| Confirmation | PKCE code | Code exchanged once; session persisted | Redacted callback result |
| Confirmation | Expired or reused link | Explicit expired/already-used error; no authenticated state is fabricated | Result |
| Preview origin | Confirmation callback | Callback URL matches configured non-production origin | Supabase Preview configuration, secrets redacted |
| Session | Fresh page load / refresh | Valid session is restored without unexpected route changes | Before/after route |
| Session | Refresh-token rotation / expired token | Rotated session works; expired session cannot fall back to stale auth | Redacted auth logs |
| Session | Sign-out and multiple tabs | Sign-out is reflected consistently; stale tabs do not retain protected access | Steps and result |
| Route guards | Signed out, unverified, missing profile | Safe login/onboarding/error route; protected data remains inaccessible | Route and network result |
| Roles | Creator, studio, buyer, internal staff roles | Each role can perform only its permitted actions | Role-to-action matrix |
| Internal roles | Forged or unauthorized internal role | Denied server-side; UI hiding alone is not considered sufficient | API response and audit log |
| Infrastructure | Network/database/API failure | Retryable error; session is not silently destroyed or user misdirected | Redacted logs and UI state |

## Exit criteria

- Automated tests, typecheck, and auth invariant check pass.
- Every manual scenario is recorded as pass/fail/not-run with evidence.
- No production data, configuration, or deployment is changed.
- Any failure is fixed and retested in Preview before review.
