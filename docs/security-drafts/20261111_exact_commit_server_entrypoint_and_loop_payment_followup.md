# Exact-Commit Follow-up: Server Entrypoints and Loop Payment Gate

Date: 2026-11-11
Repository: picturecrayons-cyber/Media-Factory
Reviewed commit: af52745a4a6609999cdca2317a999faf087be19b
Branch: chore/staging-readonly-schema-audit-20261110

## Status

SOURCE REVIEW / DOCUMENTATION ONLY — NOT CERTIFIED.

This follow-up records additional exact-commit source reads. It does not claim a repository-wide AST scan, a complete import graph, or exhaustive caller mapping. No runtime guard was implemented.

## Action / Access / Risk ledger

| Target | Action | Access | Risk | Result |
|---|---|---|---|---|
| GitHub Draft branch | Add this documentation-only follow-up | WRITE — GitHub branch | Low; no runtime behavior changes | Draft documentation |
| STAGING DB: Crayons Projects - Testing DB, project jbymleftneggcgutlcqu | No operation | READ-ONLY boundary; no connection/write | None introduced | Unchanged |
| PRODUCTION DB: project mlmgugivsyoxzdgwkbpu | No operation | NO WRITE | Critical if changed; no action taken | HOLD / NO-GO |
| Merge / deployment / promotion | No operation | NO ACTION | None introduced | HOLD |

## Expanded server-function source inventory

Focused exact-ref reads found 87 `createServerFn(` declarations across these 23 source modules. This is a count of declarations in the files listed below, not a certified total for the repository. Tests, helpers, additional routes, generated files, and indirect server entrypoints still require a deterministic AST scan.

| Source module | Declarations |
|---|---:|
| src/lib/bridge/dmca.ts | 1 |
| src/lib/loop/profile.ts | 8 |
| src/lib/bridge/assets.ts | 7 |
| src/lib/bridge/session.ts | 3 |
| src/lib/bridge/deliveries.ts | 1 |
| src/lib/bridge/streamvista.ts | 5 |
| src/lib/bridge/site-content.ts | 2 |
| src/lib/bridge/commercial-admin.ts | 3 |
| src/lib/bridge/profiles.ts | 6 |
| src/lib/bridge/story-concept-api.ts | 4 |
| src/lib/bridge/workflow.ts | 5 |
| src/lib/bridge/submissions.ts | 1 |
| src/lib/bridge/payments.ts | 4 |
| src/lib/bridge/admin-workstations.ts | 3 |
| src/lib/bridge/titles.ts | 6 |
| src/lib/bridge/multilingual-rights.ts | 5 |
| src/lib/bridge/loop-publication.ts | 6 |
| src/lib/bridge/duplicate-reconciliation.ts | 3 |
| src/lib/bridge/duplicate-title-merge.ts | 3 |
| src/lib/bridge/service-revenue.ts | 6 |
| src/lib/app-data/readiness.ts | 1 |
| src/lib/loop/catalog.ts | 3 |
| src/lib/app-data/client.server.ts | 1 |
| **Total in reviewed modules** | **87** |

## Additional HTTP and Edge entrypoints

Exact-commit source reads confirmed these TanStack route handler files:

| File | Methods | Input / identity | Observed effect | Assessment |
|---|---|---|---|---|
| src/routes/api/auth/$.ts | GET, POST | No body parsing or authenticated identity in handler | Returns status, authority and a Supabase URL literal | Public configuration response; not an identity verifier. Verify whether the literal URL is intended to be environment-independent; do not treat it as a secret. |
| src/routes/api/a2a/index.ts | GET, POST | POST parses JSON and accepts a string `skill`; no auth middleware in handler | Returns registry metadata / accepted read-only foundation contract; no business-data adapter execution | Public registry endpoint; no business-data execution currently visible. |
| src/routes/api/a2a/agent-card.ts | GET | No caller identity | Returns public agent-card and skill metadata | Public read endpoint. |
| src/routes/api/razorpay/webhook.ts | POST | Raw body and `x-razorpay-signature` | Delegates to `ingestRazorpayWebhook`; invalid signature returns 401; processing failure returns 503 | Must remain in AST/API route inventory, separately from server functions. |

A separate Supabase Edge Function exists at `supabase/functions/razorpay-webhook/index.ts`. It verifies HMAC against `RAZORPAY_WEBHOOK_SECRET`, uses a service-role Supabase client, persists `bridge_webhook_events`, and has privileged DB write capability. It detects `surface === "loop"`, but the inspected `payment.captured` branch only performs entitlement/title work for `surface === "bridge"`; a Loop event can proceed to the generic processed status without a Loop entitlement grant. This is not evidence of a working Loop payment callback.

## Loop payment-to-entitlement finding

Exact source: `src/lib/loop/subscriptions.ts`.

- `getConsumerSubscription` reads the authenticated user's active, unexpired subscription.
- `subscribeToLoopPass` accepts only `svod_monthly` or `svod_annual`, then directly inserts an active subscription with a future expiry. The handler does not create or verify a provider order, check a captured provider payment, or require a webhook-confirmed payment before inserting the active row.
- `rentTvodMovie` accepts a `loopTitleId`, checks that the title exists, then directly inserts a `TVOD_RENTAL` entitlement for 48 hours. The handler does not verify payment or a provider order before granting access.
- GitHub code search for `subscribeToLoopPass`, `rentTvodMovie`, and `getConsumerSubscription` surfaced only `src/lib/loop/subscriptions.ts` in the indexed default-branch results. This is not a complete caller proof and is not guaranteed to represent the reviewed commit's complete call graph.

**Result: FAIL for the reviewed handler-level paid-access contract / BLOCKED for end-to-end payment certification.** Do not enable or certify paid SVOD/TVOD based on these handlers. Reconcile checkout creation, provider order linkage, captured-payment verification, webhook idempotency, event persistence, entitlement issuance, expiry/refund/chargeback handling and UI callers as one flow.

The Bridge payment path's provider verification does not transfer to the Loop consumer path.

## Other exact-commit observations

- `authMiddleware` derives `userId`, `userEmail`, and email-confirmation state from `requireUser(context.bearerToken)` after same-site request checks. This is the trusted identity source for handlers using this middleware; it does not establish selected Studio organization context.
- `organization-context.ts` remains a pure helper. The exact-read handlers above do not establish that every sensitive Bridge server function invokes it with fresh database membership rows.
- `dit-assignment.ts` remains a pure exact-match helper for user + production + title + asset + active status. This follow-up does not establish persisted assignment CRUD or complete server-handler wiring.
- Loop profile/catalog functions are consumer-specific surfaces; their authorization must remain separate from Studio organization context.

## AST scan execution attempt and blocker

A deterministic local scan was not completed. The GitHub connector exposes file reads and code search but no repository archive/tree download action in the available interface. Public archive download and git clone were attempted from the execution environment but could not resolve GitHub's host. Therefore no full local checkout, TypeScript compiler-API traversal, or complete import/caller graph is available in this run.

Do not describe the 87 reviewed declarations as the repository-wide endpoint count. The repository-wide AST gate remains **BLOCKED** until a full checkout/archive is available for deterministic scanning.

## Gate decision

| Gate | Status | Evidence / next condition |
|---|---|---|
| Focused server-function source inventory | PARTIAL PASS | 87 declarations across 23 exact-ref files; not exhaustive |
| HTTP route and Edge entrypoint discovery | PARTIAL PASS | Four TanStack API route files and one Supabase Edge webhook inspected |
| Complete AST and import graph | BLOCKED | Requires full repository checkout/archive |
| Endpoint-by-endpoint input/identity/permission/DB/storage matrix | PARTIAL | Prior design inventory plus this follow-up; full matrix still open |
| UI caller reconciliation | NOT VERIFIED | Code search is not a complete import/call graph |
| Studio A/B, revocation and DIT DB-backed negatives | NOT VERIFIED | Existing helper tests do not prove persisted handler enforcement |
| Multi-Studio schema compatibility | BLOCKED | Migration 0021 one-active-org partial unique index conflicts with multi-Studio requirement; STAGING drift remains unresolved |
| Loop paid-access security | FAIL / BLOCKED | Active SVOD and TVOD entitlements can be inserted without payment proof in inspected handlers; Edge webhook does not grant Loop entitlements in the inspected capture path |
| Runtime guard implementation | HOLD | Do not wire until AST, ownership, lifecycle, DIT, payment and negative-test gates pass |
| STAGING DB | READ-ONLY ONLY | No database operation performed |
| PRODUCTION DB | HOLD / NOT CERTIFIED / NO-GO | No operation performed |

## Required next steps

1. Obtain a complete repository checkout/archive at the exact reviewed commit.
2. Run a TypeScript AST scan for all server functions, route handlers, API handlers, server actions, storage URL issuers and Edge Functions; resolve import/call sites.
3. Build the complete per-endpoint matrix: input schema, trusted identity source, permissions, DB reads/writes, storage effects, resource parent/owner chain and every UI/server caller.
4. Resolve multi-Studio membership schema and lifecycle compatibility before designing a runtime guard.
5. Establish persisted DIT assignment lifecycle and wire exact assignment checks into every relevant server operation.
6. Design a payment-confirmed Loop SVOD/TVOD flow with idempotent provider event handling and refund/chargeback reversal; test negative cases before any paid access is certified.
7. Keep DB, merge, deployment and Production gates unchanged unless separately approved.

**Certification:** BLOCKED — NOT CERTIFIED. No runtime code, DB schema, RLS, grants, migrations, secrets, deployment, merge or Production state changed by this follow-up.
