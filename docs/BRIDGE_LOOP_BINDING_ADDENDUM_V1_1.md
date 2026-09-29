# Crayons Bridge → Loop binding addendum

**Version:** 1.1 founder-approved direction · **Date:** 29 September 2026

This addendum clarifies the product boundary and minimum ingest UX for Crayons Bridge and Crayons Loop. It complements the existing Product Requirements v1.0; it does not itself certify or deploy Production.

## Canonical operating model

**Crayons Bridge is the single ingest, rights, licensing, QC, legal, commercial, syndication and delivery control plane. Crayons Loop is one owned streaming destination/buyer endpoint.**

Creators and studios do **not** upload masters or edit licensing rights in Loop. Loop receives only an authorized, versioned publication package from Bridge after the required gates pass.

No second title authority, duplicate backend, or second Supabase project may be introduced for this workflow.

## Minimal creator / studio submission

The default submission UI must remain intentionally simple. Required/conditional fields should expand only when needed.

1. Minimal title metadata: title, content type, primary language, synopsis, ownership/contact, intended exploitation.
2. Trailer.
3. Main picture master.
4. Poster/key artwork.
5. Subtitle/caption files by language.
6. Censor / age-classification certificate where legally or contractually required.
7. Rights/legal documents and other delivery assets where required.

Uploads must be resumable, private, checksummed, versioned and linked to the immutable Bridge title UUID.

## Admin direct ingest

Authorized Bridge staff may ingest on behalf of a creator/studio, but the title record must capture content owner/studio, uploader/operator, source, authority to ingest and audit timestamp. Direct ingest never bypasses rights, QC, legal or payment/contract gates.

## Admin title workbench

The Bridge admin title workspace must expose role-gated workstations for:

- Ingest and asset/version inspection
- Automated + human technical QC, issue evidence, severity, retest and final QC report
- Legal/rights review, chain-of-title and censor/age-rating evidence
- Agreement versions, approval state and amendments
- Licensing availability and conflict analysis
- Buyer, territory, language, platform/media, exclusivity and window selection
- License model and business/pricing model selection
- Invoice/payment/credit-clearance state
- Delivery package authorization, receipt, retry and revocation
- Revenue/settlement evidence and audit history

Technical QC approval and legal approval are separate gates.

## Licensing dimensions

A license/grant must support at minimum: licensor/content owner, licensee/buyer, title/version, platform/media, linear/non-linear/ancillary channel, territory, language, start/end window, exclusivity/non-exclusivity, holdback, sublicensing/promotional permissions, delivery scope, reporting obligations and restrictions.

License model and pricing/business model remain separate selections. Initial commercial models include fixed fee/minimum guarantee and revenue share, with TVOD, SVOD, AVOD, FAST, rental/purchase, screening/festival/educational/airline and other configured channels represented as contractual/exploitation dimensions rather than hard-coded assumptions.

## Buyer and multi-platform syndication

Bridge maintains the buyer registry and buyer-specific delivery profiles. A cleared title may be licensed and delivered to multiple eligible streaming platforms, broadcasters and linear/non-linear/ancillary buyers, subject to conflict checks and the signed grant.

Each buyer delivery is a scoped authorization with exact assets, metadata, territory/language/window and delivery method. Private screener access is not master-download permission.

## Publish / License actions

The title workspace should present two distinct actions when authorized:

**License / Deliver to Buyer** — starts or fulfills a B2B licensing workflow for a selected buyer/destination.

**Publish to Crayons Loop** — available only after destination rights, QC, legal, package and required commercial/authorization gates pass.

The Loop action creates a versioned publication package/event containing the Bridge title UUID, package version, approved metadata, trailer/poster/playback assets, languages/subtitles, age classification, territories, rights window and monetization model. Loop must acknowledge the exact package version.

If rights expire or are revoked, Bridge emits a revocation/takedown event. Loop must stop new playback authorization as required and return status for reconciliation.

## Loop boundary

Loop CMS owns consumer merchandising only: rails, presentation, playback, profiles/watch state, subscriptions, consumer TVOD/SVOD entitlements and consumer payment experience. It may display Bridge-derived distribution/rights status read-only.

Loop must not become a second master ingest, rights editor, licensing contract system, legal clearance system or B2B delivery authority.

## RBAC and audit

All creator, studio, buyer and Bridge staff actions remain server-enforced by organization/title scope and permission. UI visibility is not authorization. Sensitive actions—rights changes, QC/legal exceptions, agreement approval, delivery authorization, Loop publication, revocation and payout approval—must record actor, timestamp and evidence; dual approval may be configured for high-risk actions.

## Release acceptance

Implementation is not complete until the same exact commit passes CI and a matching Vercel Preview proves signed-in role-based E2E:

creator/studio minimal submit → upload assets → Bridge QC → legal/rights clearance → licensing/business model → agreement/payment clearance where required → buyer delivery **or** Publish to Loop → Loop acknowledgement/catalog/playback authorization → revocation/takedown reconciliation.

No merge or Production promotion should be performed solely from this document update.
