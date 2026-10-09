# AADVIK THE UNFINISHED STORY — Bridge → Loop Workflow

**Status:** Draft only. This document does not create a title record, approve rights, upload media, change production data, or authorize a deployment.

## Applicant-provided film details

- Title: AADVIK THE UNFINISHED STORY
- Production house: Aadvik Films
- Rights contact: Shivam Shukla
- Language: Hindi
- Genre: Crime Thriller
- Runtime: 80 minutes
- Production year: 2024
- Completion date: January 2025
- Stated shoot locations: Dehradun and Kimadi, Uttarakhand
- Cast (as provided): Raza Murad, Sandeep Chatterjee, Shivam Shukla, Neelam Rawat
- Director: Shashank Pathak
- DOP: Rombish Pathak
- Editor: Udit Khaneja
- Song and background music: Vaibhav
- Mix engineer: Dheeraj Poojary, Audio Lab Mumbai
- Declared production cost: approximately ₹33 lakh
- Declared resolution: 4264 × 2408
- Applicant claims a Best Feature award at the 11th Dehradun International Film Festival.
- Applicant claims the film has not been commercially released.
- Trailer/promo reference supplied: https://drive.google.com/file/d/1TIR_Isc1_Ol1PUIs-ldLs87i1BJMhczS/view?usp=drivesdk
- Full-film evaluation reference supplied: https://drive.google.com/file/d/1-W26muq-4leBl6WnneOOREyqzgxlXssJ/view?usp=drivesdk

All details above are unverified applicant statements until evidence is reviewed. Do not treat the audio-format wording “5.1 Atmos and Stereo,” resolution, award, rights ownership, or unreleased status as independently verified.

## Canonical operating boundary

- **CRAYONS BRIDGE** owns title ingest, source/master assets, rights and legal review, QC, licensing, commercial approvals, package authorization, delivery state, and revocation.
- **CRAYONS LOOP** owns consumer OTT presentation, playback, viewer state, and consumer entitlements/payment UX. It consumes only a versioned Bridge-authorized publication package.
- Use the existing canonical Bridge/Loop backend and identity/RBAC contracts. Do not create a duplicate title authority, auth system, or Supabase project.
- Keep the master, contracts, and sensitive legal documents private in Bridge. Loop receives only authorized publication assets and metadata.
- A private screener does not grant master-download permission.
- `LICENSING_READY` is not the same as buyer-visible or published. Listing and publication are separate gated transitions.

## Stage A — BRIDGE submission

Create one canonical Bridge title record through the normal authenticated title-submission workflow. Keep the status at `SUBMITTED` / `RIGHTS_REVIEW` until evidence is assessed. Do not insert a title directly into production tables or invent an approval.

Collect or confirm:
1. Applicant identity, account type, organization, and signing/representation authority.
2. Canonical title metadata, synopsis, language, duration, year, director/producer and credits.
3. Intended exploitation: Crayons Loop OTT; specific media/model, not a broad implied grant.
4. Structured territories, languages, media, exclusivity, sublicensing/promotional permissions, and start/end window.
5. Rights basis and private chain-of-title/authorization evidence.
6. Cast, crew, composition, lyrics, recording, sync, background-score, performer, artwork, footage, stock and other third-party rights as applicable.
7. Classification/censor evidence where applicable.
8. Private screener and approved final master.
9. Poster/key art, trailer, subtitles/captions, audio tracks and accessibility assets as needed.
10. Evidence for the claimed festival award and for the stated release history.
11. Existing agreements, holds, prior licenses, restrictions, or conflicts.

Notarization may be considered as part of evidence, but it is not by itself proof that every relevant right has been validly granted.

### BRIDGE rights/QC gates

Technical QC and legal approval are separate records and independent gates.

- `PENDING_EVIDENCE`: required evidence missing.
- `UNDER_REVIEW`: human review in progress.
- `CLARIFICATION_REQUIRED`: a discrepancy or legal question remains.
- `RIGHTS_CLEARED_FOR_PROPOSED_SCOPE`: evidence supports only the specified proposed grant.
- `REJECTED` or `ON_HOLD`: do not proceed.
- `EXPIRED_OR_ON_HOLD`: a prior approval cannot be relied on.

Before `LICENSING_READY`, confirm the actual implementation's required conditions: canonical title metadata; a valid non-expired rights grant with territories/languages/media/window; documentary rights basis; approved legal case; passed QC for current asset references; verified private screener and master; required artwork/package inputs; and at least one scoped destination package in `HOLD` or `READY`. No public submission form or evidence upload grants licensing readiness automatically.

## Stage B — BRIDGE license and destination package

Before any Loop publication authorization, record and execute the appropriate agreement:
- Legal licensor and licensee/buyer, signing authority, exact title/version and destination.
- OTT/media/exploitation and monetization model.
- Territories and languages.
- Start/end window, exclusivity, holdback and sublicensing.
- Permitted promotion and delivery scope.
- Approved price / fixed fee / minimum guarantee / revenue share as applicable.
- Reporting, payment/credit clearance, termination, revocation and takedown terms.
- Signatures, effective date, amendments and any pre-release conditions.

Keep license model separate from consumer pricing/business model. Do not assume TVOD, SVOD, AVOD, FAST, rental/purchase, or any price without recorded commercial approval. Record required payment/invoice/credit-clearance evidence as dictated by the agreement.

Create the exact versioned Loop publication package from Bridge-approved data: canonical Bridge title UUID, package/version identifier, approved metadata, trailer/poster, playback asset reference, languages/subtitles, classification, territory/window, monetization model and restrictions. Do not include contracts, source masters, or private legal evidence in the consumer package.

## Stage C — LOOP private intake and technical QC

Loop may prepare a private draft/intake record while Bridge review is underway, but it must not expose the film in its public catalog or issue playback authorization.

Validate:
- Trailer and screener links are accessible only to intended reviewers and match the supplied film.
- Final master identity, version/checksum, resolution, aspect ratio, frame rate, picture quality, color, artifacts and black frames.
- Audio track layout, language, sync, clipping, loudness and channel count.
- Whether the actual file is stereo, 5.1, Dolby Atmos, or another format; do not infer Atmos from 5.1.
- Subtitle/caption completeness, readability, encoding and synchronization.
- Required credits, poster, synopsis, title, language, runtime and classification.
- Playback on supported profiles/devices; protected manifest/segment delivery where applicable.
- The precise Bridge publication package version and its rights window/restrictions.

Proposed status path: `PRIVATE_INTAKE` → `TECHNICAL_QC_PENDING` → `TECHNICAL_QC_PASSED` → `READY_FOR_RELEASE_APPROVAL`. Use existing production state names where they differ; do not introduce unreviewed database enums simply because they appear in this document.

## Stage D — Joint publication gates

Publication remains fail-closed until every applicable gate passes:

| Gate | Owner | Acceptance |
|---|---|---|
| Applicant authority | Bridge | Identity and signing authority verified |
| Rights evidence | Bridge | Ownership/authority and third-party rights reviewed for the intended grant |
| Legal agreement | Bridge | Executed, effective agreement and release conditions recorded |
| Technical QC | Bridge + Loop per existing contract | Passed for current master/assets and report retained |
| Package authorization | Bridge | Exact versioned package approved for Loop |
| Package acknowledgement | Loop | Loop acknowledges the exact package/version; no source-master or contract leakage |
| Content/compliance | Loop + authorized reviewer | Applicable classification, policy, and content checks passed |
| Commercial setup | Authorized commercial owner | Approved monetization and availability match the agreement |
| Final publication | Authorized release approver | Explicit approval tied to title, version, package, agreement and release window |

No gate may be inferred from a successful build, a public API HTTP 200, a draft row, a private screener link, an award claim, or the existence of a payment/entitlement table.

## Stage E — Publish, verify and reconcile

Only after the joint gates pass:
1. Confirm title UUID, package version, approved master and agreement all match.
2. Apply territory, language, date-window and exploitation restrictions.
3. Configure only the authorized consumer price and monetization model.
4. Publish through the Bridge-authorized delivery path; capture Loop acknowledgement.
5. Verify the catalog listing and metadata.
6. Verify authenticated protected playback and that an unauthorized user/expired/revoked grant is denied.
7. If monetization is enabled, test the actual approved purchase/rental flow and correlate provider payment, durable payment ledger, entitlement, expiry, and protected media access. Do not certify revenue from a build test alone.
8. Record the exact publication time, approving actor, agreement, asset/package version, release/deployment reference, QA result and evidence.
9. Verify suspension, revocation, expiry and takedown handling; retain reconciliation evidence.

## Audit trail and rollback

Persist actor, timestamp, reason, before/after state and evidence reference for rights changes, QC/legal decisions, agreement approval, package authorization, publication, revocation and takedown. Keep private evidence role-restricted. If a rights dispute, expiry, missing permission or package mismatch appears, fail closed and follow the authorized hold/revocation/takedown procedure.

## Current decision for this film

**HOLD — submitted information only; not approved for licensing or publication.**

Next step: create the title through the authenticated Bridge submission flow, upload evidence privately, and route it to independent legal and technical reviewers. Only a recorded Bridge clearance, executed scope-specific agreement, accepted Loop delivery and explicit release approval may move it forward.

## Execution boundary

This is a documentation-only workflow definition. It does not create a Bridge title/case, modify application code, write database rows, upload film assets, change provider configuration, run migrations, trigger a deployment, or publish the film. The implementation must be audited and its exact-head authenticated end-to-end behavior proven before treating this workflow as operational.