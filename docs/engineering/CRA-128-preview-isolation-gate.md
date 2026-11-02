# CRA-128 — Preview isolation gate implementation

**Status:** implementation scaffold; runtime proof not yet established  
**Safety:** read-only diagnostics only. No database, storage, title, payment, or publication mutation.  
**Base:** `c7c9c81af1d305a9521861d9f5e4e63bf4d10a82`  
**Branch:** `feat/cra-128-preview-isolation-gate`

## Why this gate comes first

No synthetic OCI test or Phase 1 asset-verification implementation may run until the exact Preview deployment is tied to its runtime database and storage identities. A branch-scoped Vercel environment-variable listing is not runtime proof.

## Required evidence bundle

For each candidate Preview deployment, retain:

- Vercel deployment ID, URL/hostname, Git branch, exact commit SHA, target and deployment state.
- Runtime Supabase API project reference, derived from the configured URL without logging keys.
- Runtime Postgres host/project reference, derived from the connection URL without logging credentials.
- OCI tenancy/user/bucket/region fingerprints only; never retain private keys or secret values.
- A timestamped negative-access test proving Preview cannot read or mutate Production title/asset rows. The test must use a synthetic identity and must not attempt writes to Production.
- Exact workflow/test run IDs and independent reviewer outcome.

## Environment identity rules

1. Treat Preview and Production as separate trust zones.
2. Never infer runtime identity from a branch name, dashboard badge, Vercel READY state, HTTP 200, or a variable's existence.
3. Do not log complete database URLs, Supabase keys, OCI private keys, SMTP credentials, Razorpay secrets, signed URLs, or authorization headers.
4. If runtime database identity is unknown, report **BLOCKED** and do not start E2E.
5. If a Preview deployment resolves to the Production Supabase project or Production OCI identity, stop tests immediately and preserve all existing data.
6. Do not change environment variables as part of diagnosis. Any correction requires a separate reviewed change and approval.
7. Do not create, pause, delete, or upgrade Supabase projects to work around the Loop staging project limit.

## Current known project references

- Bridge Production Supabase: `mlmgugivsyoxzdgwkbpu`
- Bridge Testing Supabase: `jbymleftneggcgutlcqu`
- Historical staging reference `bbtrosuwisnxacuxvegt` is not accepted as current runtime proof.

These are reference values for comparison, not permission to connect to either project or modify configuration.

## Execution sequence

### A. Static configuration inventory

- Enumerate Vercel Preview environment-variable names and branch scopes.
- Record whether each relevant variable is present, absent, or has a secret-read warning.
- Do not retrieve or print secret values.
- Record the exact deployment associated with each branch-scoped configuration.

### B. Runtime identity capture

- Add or use a server-only diagnostic path that returns only deployment metadata and normalized project/bucket fingerprints.
- Ensure diagnostic output is unavailable to anonymous/public users.
- Ensure diagnostics never return secret values or complete connection URLs.
- Do not add a public health endpoint that reveals infrastructure identity.

### C. Negative boundary proof

- Use an approved synthetic Preview identity.
- Verify the identity is scoped to the approved Testing database.
- Prove it cannot select Production title/asset records through an authorized read-only test path.
- Do not attempt a Production write as a negative test.
- If credentials or identity are ambiguous, stop and report BLOCKED.

### D. Independent review

- Attach exact deployment metadata, sanitized output, test command/run ID, and reviewer decision.
- Phase 0 passes only when the same deployment SHA is tied to the runtime identity and negative boundary evidence.

## Acceptance matrix

| Check | Required outcome | Current state |
|---|---|---|
| Exact deployment ID / URL / SHA | Same Preview deployment identified | NOT VERIFIED |
| Runtime Supabase API project | Approved Testing ref | PARTIAL — branch config only |
| Runtime Postgres project | Approved Testing ref | NOT VERIFIED |
| Preview cannot access Production rows | Negative test evidence | NOT VERIFIED |
| OCI Preview identity | Non-production fingerprint | NOT VERIFIED |
| Production OCI identity absent from Preview | Sanitized scope + runtime evidence | NOT VERIFIED |
| Dedicated Loop staging | Separate approved target | BLOCKED |
| Independent reviewer | Evidence accepted | NOT STARTED |

## Stop conditions

Stop all Preview E2E immediately if:
- runtime Supabase or Postgres resolves to Production;
- Production OCI tenancy/user/bucket is present in Preview;
- the deployment SHA cannot be tied to the captured runtime;
- the diagnostic path exposes a secret or signed URL;
- the test would require a Production write, real asset, real payment, or title-state change.

## Explicit non-goals

This branch does not:
- change Supabase, Vercel, OCI, Hostinger, or Razorpay configuration;
- create or modify database schema, RLS, grants, or data;
- upload, copy, delete, relink, or download real assets;
- implement asset verification against Malayalakkara Residency;
- submit QC, legal review, publication, or buyer entitlement;
- merge, deploy, or certify Production.

## Phase 1 dependency

CRA-38 asset verification work starts only after CRA-128 Phase 0 is independently accepted. Phase 1 must use synthetic assets and an approved non-production OCI identity. Existing Production asset records remain read-only.
