# Crayons production architecture lock

This file is the owner-approved production architecture contract. Changes to any item below require explicit owner review plus migration and end-to-end verification.

## Canonical systems

- Bridge source: `picturecrayons-cyber/Media-Factory`, branch `main`
- Bridge Vercel project: `bridge` (`prj_fT7VTrZMcgP9NutDhPvMhDAPtXNo`)
- Bridge canonical domain: `https://bridge.crayonspictures.com`
- Loop source: `picturecrayons-cyber/crayons-loop-streaming-platform`, branch `main`
- Loop Vercel project: `crayonsloop` (`prj_3plh37Oe141udF7V2LUPbB5cFNHH`)
- Shared Supabase: `mlmgugivsyoxzdgwkbpu`
- Payments: Razorpay
- Transactional sender: `abijithasokan@crayonspictures.com`
- AWS media account/bucket: canonical Bridge AWS account and `crayons-bridge-prod`

## Product boundary

Bridge owns ingest, master assets, metadata, QC, rights, ownership, territories, languages, licensing, buyer/deal controls, publication authorization, B2B payments, settlements, audit and operations.

Loop owns consumer browse/search, playback, profiles, watchlist/progress, subscriptions/TVOD consumer entitlements and account UX.

Loop must not create an independent rights/licensing editor. Consumer catalog publication must flow:

`bridge_titles -> bridge_loop_publications -> loop_titles -> Loop UI`

No second Supabase project. No Bridge domain binding to non-canonical Vercel projects. No privileged browser-side service-role/AWS/payment secrets.

## Release blockers that must fail closed

A release is blocked when any of these are true:

1. GitHub `main` SHA does not match the intended Vercel Production deployment SHA.
2. Exact-head CI is not green.
3. Supabase `razorpay-webhook` deployed source does not match repository source or JWT verification is enabled at the gateway.
4. Captured payment is acknowledged before durable payment state + entitlement/publication-side effects finish.
5. Supabase Auth mail is not proven to use the configured Crayons sender/canonical callback.
6. AWS source object existence, Bridge asset path, and signed read/write flow are not all verified.
7. Legacy JSON rows are promoted directly to customer-facing access without staging/reconciliation.
8. Any release relies on fabricated transactions, titles, entitlements, audit rows or success evidence.

## Release evidence required

- Bridge exact-head CI PASS
- Loop exact-head CI PASS
- Bridge exact-head Vercel deployment READY
- Loop exact-head Vercel deployment READY
- Supabase project healthy and migrations reconciled
- Razorpay signed webhook persistence proven from a real captured payment
- Hostinger/Supabase Auth mail sender and callback proven with a new message
- AWS object -> Bridge asset -> admin visibility chain proven
- Bridge -> Loop publication record -> Loop browse visibility proven
