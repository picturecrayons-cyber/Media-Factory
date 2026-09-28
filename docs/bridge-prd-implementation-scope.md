# Bridge PRD implementation scope

This branch must preserve the release sequence: development branch -> matching Vercel Preview -> verification -> reviewed merge to main -> Production.

## Product boundary
- Crayons Bridge is the business control plane and title authority.
- Crayons Loop is the consumer OTT runtime.
- Use the existing approved Supabase backend only. Do not create a second Supabase project or a second title authority.
- All cross-system records use the immutable Bridge title UUID; display slugs never replace UUIDs.

## Title ingest / submission
Creator, Studio and authorized Bridge Admin direct ingest all open the same canonical Title Workspace.

Required submission groups:
1. Title & metadata: title, original/localized title, type, credits, languages, synopsis, artwork, territories, ownership and intended exploitation.
2. Video masters: mezzanine/original master, clean/textless/alternate/platform cuts, trailer/teaser.
3. Audio & dubs: original mix, stereo, 5.1, M&E/stems when provided, audio description, additional and dubbed-language tracks.
4. Subtitles & accessibility: subtitles, captions/CC, SDH, forced narrative, translated tracks.
5. Artwork & promotional: portrait, landscape/hero, square, title/logo treatment, stills, trailer and press assets.
6. Certification & legal: censor/age classification, chain of title, producer authority, contributor/music/artwork rights and distribution documents.
7. Rights & avails: territories, languages, platform/media, start/end with timezone, exclusivity, holdbacks, sublicensing, promotional rights, restrictions.
8. Distribution destinations: Crayons Loop plus contract-backed external OTT/broadcast/TVOD/SVOD/AVOD/FAST/airline/festival/educational/buyer delivery destinations.

## Title Workspace IA
Overview -> Metadata -> Video -> Audio & Dubs -> Subtitles & Accessibility -> Artwork -> Documents -> QC -> Legal -> Rights -> Licensing -> Distribution -> Loop -> Revenue -> Audit

Permanent readiness rail:
INGEST -> QC -> LEGAL -> RIGHTS -> PACKAGE -> DISTRIBUTION AUTHORIZATION

## Admin queues
- Ingest Desk
- QC Desk
- Legal Desk
- Licensing Desk
- Distribution Desk
- Loop Publish queue
- Revenue / settlement / audit views

Technical QC and legal approval are separate gates. Neither may substitute for the other.

## Bridge -> Loop
Loop receives only an approved publication package: consumer metadata, approved artwork, classification, authorized playback rendition, monetization/access tier, rights window, territories/languages and package version.

Do not expose Bridge source masters, legal documents or contracts to Loop.

Publishing must be blocked when QC, legal, destination package or rights gates are unresolved. Loop merchandising can change presentation, but rights edits originate in Bridge.

## Phase implementation
Phase 1: identity/RBAC, ingest wizard, versioned asset model, QC/legal queues, title status, audit.
Phase 2: private screening, buyer requests, single-title licensing, payment authorization, controlled delivery.
Phase 3: Bridge -> Loop package, publish/takedown/revocation sync, usage/revenue reconciliation.
Phase 4: multiple licenses, external destinations, package deals, advanced waterfalls and settlement automation.

## Release gate
Every phase requires exact-commit CI, matching Preview, signed-in role-based E2E and founder review before merge/promotion.
