# Bridge complete implementation gates — 2026-11-18

## Change control

| Target | Action | Access | Risk |
|---|---|---|---|
| STAGING DB (`jbymleftneggcgutlcqu`) | Schema/catalog inspection and explicitly approved rollback-only E2E fixtures | READ-ONLY by default; WRITE only inside a transaction after the test gate and explicit environment flag | Controlled; all synthetic rows must roll back |
| PRODUCTION DB (`mlmgugivsyoxzdgwkbpu`) | Compatibility, schema, grants, RLS, migration-ledger and rollback preflight only | READ-ONLY | No mutation |
| GitHub | Implementation and test changes on PR #709 branch only | Branch WRITE; no merge | Existing main and production release unaffected |
| Vercel Production | No promotion or deployment | NO ACTION | No production change |
| OCI / Razorpay / Mail | No live object mutation, payment, entitlement, publication or customer email | NO ACTION; sandbox only after separate test approval | No customer or master-media impact |
| Spend | Use existing included capacity only | ₹0 additional spend | No upgrades or paid services |

## Current PR state

- PR: https://github.com/picturecrayons-cyber/Media-Factory/pull/709
- Branch: `codex/bridge-studio-operations-phase2-20261118`
- Latest implementation commit at time of this document: `e40622f3cf192ea8ddbd7d3ecce0b5f593056eaf`. Latest CI for this exact head is pending.
- PR remains Draft, open and unmerged.
- Related Loop gateway PR: https://github.com/picturecrayons-cyber/crayons-loop-streaming-platform/pull/249 (Draft / unmerged).\n- No Production deployment or Production DB write is authorized by this work.

## Module gates

| Module | Implementation / verification required | Acceptance evidence | Status |
|---|---|---|---|
| Studio membership | Invite creation, verified-email acceptance, revoke/expiry, member role/status, owner transfer | Pure policy tests now cover verified identity, email match, expiry, revoke and replay; authenticated owner/admin browser flow and cross-org denial still need isolated Auth identities | Code tests PASS in CI; runtime E2E BLOCKED |
| Studio fixture harness | SQL-only schema/fixture contract simulation with rollback | `npm run test:staging-studio-workflows` against approved Testing DB; all rows rolled back | IMPLEMENTED; CI syntax check PASS; STAGING execution not approved; not app E2E |
| DIT | Primary upload, independent Recovery copy, object metadata, read-back bytes and SHA-256, sign-off; manifest path/checksum validation | Unit tests for deterministic manifest hashing, traversal/collision rejection, checksum/size validation added to CI; real copy evidence still requires isolated source + approved STAGING OCI credentials | Manifest unit tests PASS in CI; OCI E2E NOT VERIFIED; no OCI writes made |
| Proxy / transcoding | Durable job state, idempotent claim/lease, retry/dead-letter, FFmpeg worker, output probe, checksum, atomic completion | Worker process and queue runtime, sample derivative generated and probed; crash/retry and duplicate-job tests | BLOCKED; no durable worker runtime connected |
| Finance | Statement ingestion, source provenance, exact amount/currency, matching, discrepancy case lifecycle, dual approval, ledger tie-out | Redacted sample statement; source-to-ledger reconciliation; two distinct approvers; immutable audit; balance proof | BLOCKED; current views remain read-only |
| Payments | Razorpay sandbox order, captured event, webhook signature/idempotency, entitlement, delivery, outbox/email | Provider sandbox evidence and DB correlation IDs; duplicate webhook replay; failed webhook recovery; no live customer | NOT VERIFIED; no sandbox transaction triggered |
| Rights / Loop Gateway | Grant coverage by territory/language/media/model/window; current QC/Legal approval; destination package bound to active grant and review IDs; checksum-verified `LOOP_HLS_MASTER` only; regional rights are not widened to WORLDWIDE | Negative/positive policy tests; Bridge writes only an authorized projection; Loop catalogue, checkout and protected playback enforce the same territory grant | Implementation added; latest CI pending; runtime E2E NOT VERIFIED |
| Buyer / licensing | Only legally/QC/rights/packaging-approved listings; buyer-scoped offers/contracts/invoices/deliveries | Six-role session tests; buyer A cannot read buyer B deals/prices; no private master access | NOT VERIFIED |
| Delivery | Authorized package creation, checksums, recipient/territory/window controls, download audit, retries | End-to-end package generation and controlled test download with checksum and audit trace | NOT VERIFIED |
| RBAC | Super Admin, Admin, Investor, Creator, Studio, Buyer | Authenticated browser sessions and allow/deny matrix across pages, server actions, APIs, rows, assets and downloads | NOT VERIFIED |
| Production | Migration compatibility, ordered replay, backup/restore evidence, rollback and release review | Separate Production READ-ONLY inventory, exact migration diff, rollback plan, signed approval and post-deploy verification plan | HOLD / NOT CERTIFIED / NO-GO |

## Bridge → Loop Gateway implementation

- Bridge Distribution Desk no longer assumes every publication is WORLDWIDE. Requested territories, language, exploitation model and explicit start/end dates must be covered by a valid Bridge rights grant.
- The Distribution Desk can only enable authorization after the title has a READY Crayons Loop destination package tied to the current rights grant, QC case and Legal case.
- The package must include a `LOOP_HLS_MASTER` asset version with `processing_state='PASSED'`, a valid SHA-256 and a positive byte size. A title's private `master_key` is never copied into Loop `playback_path`.
- The Loop repository PR #249 applies Bridge territory grants consistently to public catalogue, semantic search, TVOD checkout and protected playback, using the platform-provided `x-vercel-ip-country` header. Regional grants fail closed if country is unavailable; worldwide grants remain global.
- Loop adds server-only OCI read-PAR signing for Bridge-originated media. Required OCI server variables are documented in Loop `.env.example`; no credentials were added or deployed.
- Master/poster indicators in Bridge are labelled REGISTERED, not VERIFIED, when they only reflect a stored object key.

**Not yet certified:** OCI credentials and object reachability, HLS playlist/segment delivery, authenticated Loop playback, TVOD order → captured payment → entitlement, and visible catalogue E2E. No titles were seeded or published by this implementation.
## Rollback-only Studio workflow smoke

The new `scripts/staging-studio-workflow-smoke.mjs` is a **rollback-only SQL fixture contract smoke**, not an invocation of the application server action:

1. Requires `BRIDGE_STAGING_PROJECT_REF=jbymleftneggcgutlcqu`.
2. Requires `BRIDGE_STAGING_SUPABASE_URL` to resolve to that exact Testing project.
3. Requires a direct Testing DB host or pooler username containing the same project ref.
4. Requires `BRIDGE_STAGING_WORKFLOW_FIXTURES_APPROVED=true`.
5. Performs a read-only table/column preflight before beginning a transaction.
6. Uses synthetic `example.invalid` identities and a random Studio organization.
7. Checks invitation email binding and verified-email acceptance; stores only a token hash.
8. Checks two-party owner/admin handover and its audit trail.
9. Rolls the entire transaction back in `finally` on success or failure.

Run only after the STAGING test gate is explicitly approved:

```sh
npm run test:staging-studio-workflows
```

The smoke is a database SQL-contract simulation, **not** an application lifecycle test and **not** an authenticated server-action/browser E2E. It does not invoke `acceptStudioInvitation`, send email, create Supabase Auth users, exercise RLS as an authenticated user, or contact OCI. Its PASS can never be promoted to invitation runtime E2E PASS.

## Release rules

- No workflow UI, queue row, payment status, ledger status, HTTP 200, deployment status or CI result alone is production certification.
- No Creator/Studio statement is represented as bank-settled without bank-source reconciliation.
- No media copy is verified without object read-back and SHA-256 equality.
- No title becomes buyer-visible or Loop-published without separate QC, Legal/Rights and publication authorization.
- No role is certified from navigation visibility alone; every server-side resource boundary must be exercised.
- Preserve all existing title, asset, master, rights, audit, delivery and payment records. Do not delete or overwrite source objects.
- Production remains READ-ONLY and HOLD until every required gate is independently evidenced and separately approved.
