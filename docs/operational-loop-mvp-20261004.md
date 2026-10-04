# Operational Bridge → Loop MVP

Base: `7386e1996eaa6daf539daf1ebdc3e22fd774e5cc`. Production remains at the previously audited `f8678f4c5017590b741d161fac580e2b045347b0`; this document is source evidence, not runtime certification.

## Implemented

- Title Workspace has Prepare, Business, Distribution and Revenue operations backed by server functions and the existing canonical tables.
- Creator/studio owners retain private title ingest. An explicit `title.ingest_internal` permission permits direct CMS ingest for verified super admins only; staff do not inherit creator permissions. Title ownership here identifies the workspace custodian, not legal film ownership.
- Verified current master/artwork are required before QC submission and approval. Review results, lifecycle changes and audit records share one transaction. Rejection returns the title to preparation. This is manual review; no transcoding worker has been introduced.
- Immutable Loop license drafts record ownership/agreement references, worldwide TVOD windows, exclusivity and explicit gross revenue shares. A different legal reviewer approves the draft. Supplied document references are reviewed by the operator; the app does not independently attest legal ownership.
- Publication requires recorded QC approval for the current asset references and legal approval for the covering license. Approved license terms are used rather than caller-provided commercial overrides. Loop catalog/publication/audit mutations are transactional. Suspension and revocation also update both catalog and authorization records transactionally.
- Revenue reads deduplicated canonical fulfillment/payment records; old ledger gaps are reconciled with at most 12 read-only provider lookups, in batches of 3 with 5-second timeouts. Missing/refunded/unavailable amount evidence is not replaced with the current rental price. Receipt queries are capped at 200 records; this is an operational receipt view, not a complete period accounting report.
- Gross producer shares are shown only when one independently approved historical license covers the purchase time and the amount is evidenced. Fees, taxes and refunds still require reconciliation. Receipt CSV export escapes formula-leading cells.
- Finance roles can record external settlement, invoice and reconciled-statement references in the audit ledger, explicitly marked `EXTERNAL_EVIDENCE_UNVERIFIED`. This does not transfer money, generate a tax invoice, verify a bank transfer or certify a settlement.
- Canonical Bridge constants and transactional email links use `https://www.crayonspictures.in`. Regression tests for rejected old origins remain. Domain/Auth/SMTP/DNS/provider configuration is unchanged.

## Verification boundary

`npm run build`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run secret-scan`, `node scripts/check-vercel-output.mjs` are the local gates. SQL behavioral tests execute the real exported workflow services against isolated PGLite, including persisted reviews, permission denials, audit-failure rollback, concurrency and self-approval denial. Transport/auth dependencies are isolated; these are not authenticated production E2E tests.

CI additionally runs the same service tests against an ephemeral PostgreSQL 16 service. Static `workflow_test` credentials exist only for that disposable test database, with a strict localhost/database binding check, no production secret fallback, isolated schemas, bounded database waits and `finally` cleanup. Exact-head CI must pass before this evidence is accepted.

## Observed blockers and release gates

- Local full-app bootstrap fails because the existing migration chain expects the Supabase `anon` role. This patch does not weaken production RLS or rewrite the shared migration chain to hide the failure.
- Local browser smoke could not launch because Chromium is absent; the attempted download returned invalid/truncated archives. No rendered-screen or signed-in browser PASS is claimed.
- Exact-head Preview READY, runtime binding to `mlmgugivsyoxzdgwkbpu`, signed-in creator/operator/buyer isolation, onboarding recovery and PostgreSQL onboarding failure/concurrency evidence remain release gates.
- Real AWS media accessibility/packaging and supported browser playback must be proven. Manual QC records and catalog publication are not playback certification.
- Loop's audited live apex-to-www redirect still needs alignment with the provider-approved checkout origin; this patch does not alter the live domain or create a payment.
- One real authorized film must demonstrate Bridge review/license → Loop visibility → captured rental → matching durable entitlement → protected playback, followed by suspension/revocation/expiry denial.
- External settlement evidence and a reconciled producer statement need independent financial verification before settlement certification.

No production migrations, auth/RLS changes, provider orders/captures/transfers, emails or deployments were performed. No second Supabase or project was created. Production HOLD remains.
