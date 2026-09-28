# Crayons Bridge — Permanent Green Baseline

This file records verified Bridge decisions and release invariants that must not regress.

## Already permanent on `main`

These are production-baseline decisions already merged to `main`:

- Bridge is the business control plane and the canonical title authority.
- Loop is the consumer OTT runtime.
- Rights, licensing, QC approval, legal approval, buyer authorization, distribution authorization, settlement and audit originate in Bridge.
- Loop may consume an approved publication/delivery package but does not become a second rights authority.
- Bridge operational tables remain behind server-enforced RBAC and fail closed.
- Customer-facing product name is Crayons Bridge.
- Production project/repository topology remains canonical; do not create replacement Bridge projects.

Reference merged commits:
- `78fd6cf96fcd9068001244e789ff874a1be847e9` — canonical production topology lock
- `d570478012801739670d1e78062fdf265a4fcdf7` — Bridge Data API behind server RBAC
- `c1f48f8288d9b7898e813f51aecc916d283da201` — Bridge as Loop CMS/control panel architecture lock
- `53423c72896f79ad24249eb22c24bf897c32b504` — current production baseline on `main`

## Verified green on PR stack, not yet production

Do not treat these as production until the remaining runtime gates pass:

### PR #23 — Auth identity binding
- Verified Supabase Auth identities resolve to Bridge profile identities through the explicit identity-link mapping.
- Do not rewrite legacy Bridge profile primary keys.
- Single canonical Supabase project boundary is preserved.
- Email verification must persist the resolved Bridge profile identity, never a raw unrelated auth UUID.
- Production remains unchanged until signed-in role E2E is completed.

Verified candidate reference:
- `4c5dda17f9af81dfab01077ddf11575354752dda`

### PR #24 — Supply-chain verification and fail-closed delivery
- A presigned PUT is not itself a verified asset.
- Verified uploads are sealed to an immutable key before title references are persisted.
- Source masters are never exposed to buyers.
- Internal reviewer authorization is evaluated independently of buyer account type.
- Upload UI must be gated by the actual `asset.sign_upload` permission.
- QC, legal, rights, package readiness and distribution authorization are separate recorded gates.
- Missing records must render as unavailable/pending, never inferred pass.
- Destination-package readiness must be deterministic across destinations.
- Revenue must not be fabricated or inferred from lifecycle state.
- The additive Phase-1 schema is applied to the canonical Supabase database and remains fail-closed.

Verified candidate references:
- `3b6ab993ecdf66a6f5c82e0b082f93aa2e577f84` — review findings resolved and CI green
- `0a71ed411c9acdd1464e3853212f6c551a34d485` — simplified visual dashboard UI, CI green and exact-head Vercel Preview built
- `ed1552e9b738cf3cf3f4d102e7a383ab6ee8269e` — static-shell deployment regression guard stack head

## Permanent release invariants

Every Bridge release must satisfy all of the following:

1. Exact-head GitHub CI passes.
2. The matching Vercel Preview is READY for that same SHA.
3. Preview must route through the TanStack server output; a static fallback shell is a release failure.
4. Signed-in role E2E must prove server-enforced RBAC.
5. Private S3 upload must prove: signed upload -> object verification -> immutable seal -> DB persistence -> authorized download.
6. Buyer access must never expose masters or raw S3 object keys.
7. Supabase remains one canonical project. No second Bridge/Loop authority database.
8. Bridge server-only tables stay fail-closed unless a reviewed row-level client access requirement is explicitly introduced.
9. No fabricated rights, QC, legal, package, revenue or delivery state.
10. Production merge/promotion occurs only after all release gates pass.

## Currently separate / still open

Keep these workstreams separate until each has its own runtime proof:

- AWS least-privilege IAM principal and root-key retirement.
- Live private-S3 upload/seal/download E2E.
- Signed-in RBAC E2E across creator/studio/buyer/internal roles.
- Razorpay captured payment -> durable entitlement -> authorized playback in Loop.
- Hostinger transactional-mail receiver verification for Bridge.
- Supabase leaked-password protection setting.
- Final exact-head Vercel Preview for the static-shell fix stack when quota permits.

Do not merge PR #24 directly to `main` while it remains stacked on PR #23 or while any runtime gate above is open.
