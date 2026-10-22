# Simple Guided Workflows — Bridge and Loop

## UX promise

Every role, on every supported channel and screen size, should answer three questions without technical knowledge:

1. **Where is this item now?**
2. **What is blocking it?**
3. **What is the one next action I can take?**

Keep the interface simple; keep authorization and evidence requirements strict.

## Shared workflow card

Each title, asset, QC task, license, delivery, and order should expose a consistent summary where applicable:

- Plain-language status
- One primary next action, shown only when the actor has permission
- Blocking requirements and the reason in plain language
- Current owner / who acts next
- Last-updated time and an audit/history link
- Helpful recovery guidance for failed or pending operations

Do not show success before the authoritative server-side operation and persistence are confirmed.

## Bridge lifecycle

1. **Submit** — uploader enters required metadata and uploads files.
2. **Secure and verify** — transfer, object metadata, integrity, and database persistence are checked independently. Pending or failed verification is not success.
3. **Review** — admin sees one queue and can approve QC or request changes with a reason.
4. **Rights and legal** — verify rights, territory, term, and required legal evidence.
5. **Authorize** — a permitted actor approves the exact title/version and distribution scope.
6. **Deliver** — publish only the authorized version to the permitted channel; record delivery evidence.
7. **Reconcile** — track offers, payments, entitlements, and revenue separately.

Storage, QC, rights/legal, authorization, delivery, and revenue statuses remain independent. A successful earlier stage never silently approves a later stage.

## Loop TVOD

- Display only content explicitly authorized by Bridge for Loop and eligible for the configured TVOD offer.
- Show a clear price and purchase action.
- Grant entitlement only after verified Razorpay payment capture and idempotent server-side reconciliation.
- Distinguish pending, failed, paid, and entitled states; allow safe retry only when order/payment state is known.
- Keep payment integration in test mode until end-to-end evidence and release approval are complete.

## Role-based views

- **Uploader / studio:** upload, see progress, understand issues, respond to change requests, submit a new version.
- **QC / admin:** triage one queue, inspect evidence, record decisions and reasons, request changes.
- **Rights / legal:** see required evidence and blockers; record explicit decisions.
- **Distribution / operations:** authorize and verify delivery without bypassing QC or rights gates.
- **Buyer:** discover eligible titles, see clear offer/license state, purchase where available, access only entitled delivery.
- **Super admin:** manage permitted operational tasks with server-side RBAC and a complete audit trail.

## Cross-channel standards

- Responsive mobile and desktop layouts with the same state and permissions.
- Consistent loading, empty, error, success, and pending states.
- Keyboard access, visible focus, labels, and screen-reader announcements.
- Plain-language errors explaining what happened, whether an action is safe, and who should act next.
- No accidental resubmission, duplicate notifications, blind retries, or hidden destructive actions.
- Never expose secrets, signed URLs, internal stack traces, or privileged actions to unauthorized roles.

## Release and safety gates

Production remains **HOLD / NOT CERTIFIED** until the exact commit has passing tests, typecheck, build, independent review, exact-SHA Preview evidence, staging-only database proof, isolated non-production OCI end-to-end evidence, Razorpay test-mode payment/entitlement evidence, accessibility/regression checks, and release-readiness evidence.

Do not mutate production data, retry/remove existing unverified title assets, publish test titles, change buyer visibility, merge, or promote a deployment as part of unverified implementation.

## Acceptance checklist

- [ ] Every role sees one clear next action or a clear reason no action is available.
- [ ] All transitions are authorized server-side and audited.
- [ ] Storage verification, QC, rights/legal, authorization, delivery, and revenue remain independent gates.
- [ ] Request-changes and resubmission preserve history and versions.
- [ ] Loop shows only explicitly authorized and eligible TVOD content.
- [ ] Payment capture and entitlement are idempotent and reconciled server-side.
- [ ] Mobile, desktop, keyboard, and screen-reader paths are tested.
- [ ] Tests, typecheck, build, Preview, isolation, and independent review pass before production release.
