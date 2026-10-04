# Bridge release-readiness gates

This document defines the production gates for Crayons Bridge integrations that must be proven before a release is promoted.

## 1. Bridge → Crayons LOOP publication

A title is only publishable when Bridge preflight passes:

- lifecycle is at least `LICENSING_READY`
- a private master object is registered
- a consumer poster is registered
- the operator has `loop.publish`
- territories, languages and exploitation model are explicit
- the distribution window is valid

Successful authorization must create or update both:

- `bridge_loop_publications`
- `loop_titles`

The LOOP application is a consumer delivery surface. Rights/licensing edits remain in Bridge.

### Evidence

Run a real authenticated Bridge admin flow and record:

1. Bridge title ID.
2. Preflight result.
3. Authorization audit event.
4. `bridge_loop_publications` row.
5. `loop_titles` row with `published=true` and `listed=true`.
6. The title visible in LOOP browse.

Do not seed or fabricate catalog records to satisfy this gate.

## 2. AWS private-media E2E

Bridge signs private S3 PUT/GET requests. A release is not AWS-certified from source code presence alone.

### Evidence

For a real authenticated title:

1. Request a signed upload URL.
2. Upload a real source object.
3. Confirm the S3 object exists.
4. Confirm the Bridge asset/title record references the same object key.
5. Request a signed download URL and retrieve the object.
6. Record QC/job persistence when the processor is enabled.

Required runtime variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET`

Never expose AWS secrets to browser-prefixed variables.

## 3. Supabase Auth → Hostinger SMTP

Hostinger mailbox availability does not prove Supabase Auth SMTP binding.

Expected sender:

`abijithasokan@crayonspictures.com`

### Evidence

After SMTP configuration is saved in the canonical Supabase project, trigger a brand-new signup or password-recovery message and verify:

1. sender is the configured Crayons Pictures mailbox
2. callback URL is the canonical Bridge domain
3. callback completes successfully
4. no new auth mail is sent by `noreply@mail.app.supabase.io`

Bridge transactional mail also requires:

- `SMTP_HOST` or `HOSTINGER_SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER` or `HOSTINGER_SMTP_USER`
- `SMTP_PASS` or `HOSTINGER_SMTP_PASS`
- `MAIL_FROM=abijithasokan@crayonspictures.com`

## 4. Custom domains

Canonical domains:

- Bridge: `www.crayonspictures.in`
- LOOP: `crayonsloop.com`

Before release certification, both must resolve to their canonical Vercel projects and return the intended Production deployment.

### Bridge DNS expectation

The `bridge` host must not be served by Hostinger's parking/Under Construction origin. Remove conflicting A/AAAA/CNAME records and keep only the Vercel-required record shown in the Vercel domain configuration.

### LOOP domain expectation

`crayonsloop.com` must be assigned to the `crayonsloop` Vercel project and resolve to its current Production deployment.

## 5. Release rule

Do not mark the release certified or promote a staged integration based on a green build alone.

All four integration gates above require real E2E evidence:

- Bridge → LOOP publication PASS
- AWS upload/download PASS
- Supabase Auth → Hostinger SMTP PASS
- custom domains PASS

Production remains unchanged until those checks are recorded.


## Product boundary: Bridge is the LOOP CMS and Admin control plane

Crayons Bridge is the authoritative CMS/admin system for Crayons LOOP.

Bridge owns:
- title ingest and master assets
- metadata and artwork
- QC and technical readiness
- rights, ownership, territories, languages and windows
- licensing and commercial terms
- LOOP publication authorization, suspension and revocation
- buyer/deal controls, delivery authorization, payments, audit and operations

Crayons LOOP owns:
- consumer home/browse/search presentation
- playback
- profiles, watchlist and watch progress
- subscriptions, TVOD consumer entitlements and account UX

LOOP must not provide an independent rights/licensing editor. A LOOP title should enter the consumer catalog only through a Bridge-authorized publication record. The canonical relationship is:

`bridge_titles → bridge_loop_publications → loop_titles → LOOP consumer UI`

The Vercel project `bridge` remains the production deployment target for this CMS/admin control plane. The separate Vercel project `crayonsloop` remains the consumer streaming application.
