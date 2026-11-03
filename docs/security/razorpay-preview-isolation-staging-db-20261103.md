# Razorpay Preview Isolation + STAGING DB Payment Security

**Status:** Draft implementation plan for review; no production action authorized.
**Scope:** Dedicated Vercel Preview branch + Supabase Testing project `jbymleftneggcgutlcqu` only.
**Production:** HOLD / NOT CERTIFIED / NO-GO.

## Explicit non-goals

- Do not merge this PR.
- Do not deploy or promote any deployment.
- Do not modify Vercel Production environment variables.
- Do not read, rotate, copy, or expose Production Razorpay secrets.
- Do not apply SQL to either database from this PR.
- Do not create a live payment, send email, or change Production Supabase schema/RLS/Auth.
- Do not enable Preview payment checkout until the security and isolation gates below pass.

## Verified starting point (read-only, 2026-11-03)

### GitHub

- Repository: `picturecrayons-cyber/Media-Factory`, default branch `main`.
- Payment order creation and client payment-signature verification live in `src/lib/bridge/payments.ts`.
- Raw-body webhook verification lives in `src/lib/bridge/razorpay-crypto.ts` and `src/routes/api/razorpay/webhook.ts`.
- A Supabase Edge webhook implementation also exists at `supabase/functions/razorpay-webhook/index.ts`; it is a separate implementation and must not drift from the server route's validation and entitlement rules.
- The app's current bridge identity model is Better Auth + server-side RBAC and server-side Postgres access. Do not invent `auth.uid()` ownership policies for these tables.

### Vercel

- Project: `bridge`.
- Preview Razorpay keys currently have empty fail-closed placeholders scoped to branch `perf/426-login-session-single-call-20261030`.
- Production Razorpay variables are separately scoped to Production. Their values were not decrypted or inspected.
- Existing Testing Supabase Preview variables are attached to different branch scopes; this does not yet constitute one coherent Preview payment environment.
- A Vercel `READY` deployment is not payment certification.

### Supabase Testing DB (NOT Production DB)

Project ref: `jbymleftneggcgutlcqu`.

Read-only inspection confirmed:

- `bridge_payments`, `bridge_webhook_events`, and `bridge_entitlements` exist.
- RLS is enabled on all three tables; FORCE RLS is not enabled.
- No RLS policies were found on these three tables.
- `anon` and `authenticated` currently have broad table privileges, including SELECT/INSERT/UPDATE/DELETE/TRUNCATE and other table privileges.
- `service_role` has table privileges.
- This is a fail condition for enabling browser-facing payment flows.

## Implementation requirements

### A. Dedicated Preview environment

1. Create one dedicated branch and use it consistently for the Preview deployment and all branch-scoped variables.
2. Bind only the Testing Supabase URL, publishable key, and Testing DB connection for this branch. Confirm the project ref at runtime; fail closed if it is not `jbymleftneggcgutlcqu`.
3. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only after the owner supplies Razorpay **Test Mode** credentials. Never paste credentials into GitHub, PR comments, logs, or chat.
4. Validate that the Preview key ID is a Test Mode key (expected `rzp_test_` prefix) and reject a Live key in Preview. Keep secrets server-only; do not use `VITE_` or `NEXT_PUBLIC_` prefixes.
5. Require an explicit Preview runtime mode and exact allowed Testing Supabase project ref before checkout or webhook processing. Missing/mismatched configuration must fail closed.
6. Use a test-only webhook endpoint configuration in the Razorpay Test Mode dashboard. Do not point the Production webhook configuration at Preview.

### B. STAGING DB payment-table boundary

The current Bridge application authenticates with Better Auth and authorizes through server-side RBAC; the browser must not access these payment operational tables directly. Prepare a new Supabase migration using the Supabase CLI after review, containing the equivalent of:

```sql
-- STAGING DB ONLY: jbymleftneggcgutlcqu
revoke all privileges on table public.bridge_payments from anon, authenticated;
revoke all privileges on table public.bridge_webhook_events from anon, authenticated;
revoke all privileges on table public.bridge_entitlements from anon, authenticated;
```

Do not add broad `TO authenticated` policies. Keep RLS enabled. Keep service-role access limited to trusted server/Edge Function code. Confirm that the deployed app's database role can still perform its intended server-side operations before enabling checkout.

This is a proposed SQL fragment in documentation, not an applied migration. Before producing the executable migration, re-check grants, ownership, dependencies, and the complete table definitions on the Testing DB. Do not apply it to Production.

### C. Webhook correctness and reconciliation

- Verify `X-Razorpay-Signature` against the exact raw request body before parsing JSON.
- Reject missing/invalid signatures with 401; transient persistence/provider failures must return retryable 5xx.
- Verify the payment against Razorpay's server API, including captured status, order ID, amount, and currency, before marking it captured or granting entitlements.
- Ensure only the payment record associated with the exact Preview order can be updated.
- Make webhook event claiming atomic; duplicates must not grant entitlements twice.
- Handle concurrent delivery, stale processing leases, payload/event ID collisions, retries, refunds, and unknown event types explicitly.
- Reconcile local payment state against Razorpay order/payment state; never trust browser success callbacks as payment proof.
- Ensure entitlement creation and payment capture state changes are transactionally safe or recoverable without duplicate grants.
- Review both webhook implementations and either consolidate them or prove identical security behavior.

## Required tests (must be automated where practical)

1. Preview rejects `rzp_live_` keys and accepts only the owner-supplied Test Mode key.
2. Missing one or more Preview credentials fails closed.
3. Runtime refuses Production Supabase ref and any unapproved database target.
4. `anon`: SELECT/INSERT/UPDATE/DELETE/TRUNCATE denied on all three payment tables.
5. `authenticated`: same direct table operations denied.
6. Trusted server DB connection and webhook service role retain only required operations.
7. Valid test order uses expected INR amount and exact order association.
8. Invalid/missing payment signature rejected.
9. Invalid/missing webhook signature rejected before persistence.
10. Duplicate and concurrent webhook deliveries produce one durable payment capture and one entitlement.
11. Wrong order, amount, currency, account, or payment ID never grants access.
12. Transient database/provider failure returns retryable response and later reconciles safely.
13. Refund/chargeback and unknown events do not accidentally grant or preserve access.
14. Buyer A cannot read or receive Buyer B's payment or entitlement.
15. No Live Razorpay API credentials, production database references, or production endpoints are present in the Preview bundle/configuration.

## Acceptance evidence

For each check, record exact commit SHA, Preview URL, Testing Supabase project ref, test identity, request/event IDs (non-secret), expected/observed result, and logs with secrets redacted. Mark each PASS / FAIL / BLOCKED / NOT VERIFIED.

Required gates before enabling Preview checkout:

- [ ] One coherent dedicated Preview branch and branch-scoped Testing DB config
- [ ] Test Mode credentials supplied and configured by owner
- [ ] STAGING DB privilege migration reviewed, generated, applied only to Testing, and verified
- [ ] Both webhook implementations aligned and tested
- [ ] Automated negative authorization tests pass
- [ ] Test order + capture + webhook + reconciliation E2E pass
- [ ] Duplicate/concurrency and failure/retry tests pass
- [ ] Exact-SHA evidence reviewed

## Release decision

This PR is a draft for code review only. Creating it does not authorize merging, deployment, applying migrations, adding credentials, or enabling payment checkout. Production remains **HOLD / NOT CERTIFIED / NO-GO** until separately reviewed and explicitly approved.
