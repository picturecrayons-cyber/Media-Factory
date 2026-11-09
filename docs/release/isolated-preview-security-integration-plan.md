# Isolated Preview Security & Integration Plan

## Release posture

- Production: **HOLD / NOT CERTIFIED / NO-GO**.
- This branch is based on `8bb087d70b8b56643ba7b3729c9516807473ca00`.
- No Production database, RLS policy, Auth setting, object, email, payment, or deployment was changed by this plan.
- Do not promote or merge this branch until the gates below have evidence and explicit approval.

## Gate 1 — Supabase access-control design

### Tables requiring narrow policies
- `bridge_production_assets`
- `bridge_delivery_jobs`
- `bridge_story_concept_submissions`

Before writing executable policies, inspect the actual schema, foreign keys, grants, existing policies, and application authorization helpers. Do not assume column names or role relationships.

Expected authorization tests:
- anonymous user: denied;
- unrelated authenticated user: denied;
- owner: limited to their own records;
- assigned vendor: only assigned delivery jobs, and only permitted status transitions;
- buyer/evaluator without an explicit grant or shortlist: denied;
- buyer/evaluator with a valid explicit grant: SELECT only, limited to authorized records;
- internal admin: only the operations allowed by the canonical internal-role check;
- super_admin: do not infer global write permissions from the role name; follow the platform's documented permission matrix.

Every UPDATE policy must constrain both the existing row (USING) and the resulting row (WITH CHECK). Test attempts to change owner, title, assignment, role, or authorization fields.

### Server-only tables
- `bridge_buyer_interest`
- `bridge_clearance`
- `bridge_desk_notes`
- `bridge_desk_offers`
- `bridge_enquiries`
- `bridge_ops_flags`
- `bridge_outlet_deals`
- `bridge_publishing_partners`
- `bridge_screener_requests`
- `bridge_studio_files`
- `bridge_title_seo`
- `bridge_title_submission_intake`

Verify RLS, table grants, views, functions, and any exposed RPC paths. Keep client roles denied where client access is not required. Use the service-role/secret key only in trusted server-side code; never expose it to browser bundles. Empty policy lists alone do not prove the entire access path is safe.

### Auth setting
Leaked Password Protection is an Auth configuration control, not an RLS policy. Check its current setting and availability in the staging project's Auth settings; do not change Production as part of this Preview work.

## Gate 2 — OCI Object Storage

Current inspected code at the base commit uses `@aws-sdk/client-s3` in `src/lib/bridge/aws-object-storage.server.ts`; OCI variables in `src/lib/bridge/env.ts` do not prove that the adapter sends native OCI requests.

- Inspect existing storage interfaces, callers, tests, and dependencies before choosing an OCI SDK/API implementation.
- Implement OCI support behind a server-only provider boundary; fail closed when provider configuration is incomplete.
- Use a dedicated non-production bucket and non-production credentials only.
- Verify actual OCI upload, read-back bytes, content length, ETag semantics, conditional source check, sealing/copy, destination HEAD, and signed download behavior.
- Do not treat mocked S3 tests as OCI E2E evidence. Record live E2E as NOT VERIFIED until real OCI responses are captured without secrets.

## Gate 3 — Hostinger Mail and Razorpay

- SMTP: use Preview-only SMTP credentials and a designated test recipient; verify accepted send and mailbox receipt, plus failure handling. Never send uncontrolled production mail.
- Razorpay: use test-mode key ID/secret/webhook secret only. Test order creation, signature validation, webhook idempotency, invalid signatures, retries, and failure states. Do not use live keys or perform real payments.
- Never log or commit credentials, tokens, private keys, or webhook secrets.

## Gate 4 — Preview runtime and page audit

Configure Preview variables to point only to non-production resources. The inspected canonical URL resolver currently pins Supabase to Production ref `mlmgugivsyoxzdgwkbpu`; staging ref `bbtrosuwisnxacuxvegt` must not be used until a deliberate, environment-aware allowlist is implemented and tested. Do not bypass canonical checks by simply weakening validation.

For each page/flow, record exact commit SHA, Preview URL, test identity/role, steps, expected result, observed result, logs/evidence, and one status:
- WORKING — observed end-to-end with evidence;
- FAIL — reproducible mismatch or security failure;
- NOT VERIFIED — access, credentials, test data, or evidence missing.

Minimum flows: sign-in/session refresh/sign-out; protected routes; role isolation; dashboard save/read; upload/read-back/ETag/sealing/download; SMTP delivery; Razorpay test-mode order/signature/webhook; failure paths.

## Release gate

A green CI run, successful deployment status, configuration metadata, or an HTTP 200 response is not sufficient for certification. Production remains HOLD / NOT CERTIFIED / NO-GO until all required security and runtime gates have exact-SHA evidence and are explicitly approved.
