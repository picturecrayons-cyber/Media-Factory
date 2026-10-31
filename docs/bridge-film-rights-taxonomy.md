# Crayons Bridge — Film Rights Taxonomy (Admin & Buyer Discovery)

## Scope

Internal Bridge admin and buyer-discovery control plane. This is not a studio/creator submission form. One canonical `bridge_titles` record may have many separately scoped rights records. The vocabulary catalog describes categories only; it does not establish that any title owns a right.

## Architecture

`bridge_titles` → `bridge_title_rights` → territories + language scopes + evidence + commitments → buyer requirements/matching → offers and agreements → explicit Loop publication grant.

Keep three states independent:

- **Evidence:** missing, pending review, verified, rejected, disputed.
- **Availability:** unknown, available, partially available, committed, restricted, expired.
- **Deal/publication:** existing deal workflow and the separate Loop publication grant lifecycle.

Commercial structures (fixed fee, minimum guarantee, revenue share, package, exclusivity, territory pricing) belong to offers/agreements and must not be used as the rights taxonomy itself.

## Rights families

- **Linear:** first-run/re-release theatrical, free-to-air TV, pay TV, satellite/cable, premiere windows, repeat telecasts, scheduled FAST channels and programmed events.
- **Non-linear:** SVOD, TVOD rental, EST/digital purchase, AVOD, BVOD/catch-up, premium VOD, PPV, FAST-linked catalogue VOD, offline/download, mobile, web/connected TV and managed streaming.
- **Ancillary:** airline IFE, hotel, transport, educational, corporate/institutional, public/festival/cultural screenings, trailers, clips, soundtrack and audio-only exploitation.
- **Derivative:** remake, sequel/prequel, spin-off/character, format/localisation adaptation, interactive/game, merchandising and publishing.
- **Technical permissions:** remaster/restoration, dubbing/subtitling, accessibility versions, territory edits and archive/preservation.

Mobile, web, connected-TV and cloud are normally delivery methods, not independent grants. Keep them as technical/transmission constraints unless a contract expressly separates them. BVOD catch-up and time-shifted access may need a separately scoped on-demand grant.

## Data model added by the draft migration

- `bridge_rights_categories`: controlled vocabulary and buyer types.
- `bridge_title_rights`: title/category-specific status, exclusivity, dates, windows, monetisation and restrictions.
- `bridge_title_right_territories` and `bridge_title_right_languages`: normalized scopes.
- `bridge_rights_evidence`: evidence references, hashes, review state and confidentiality.
- `bridge_rights_commitments`: signed licences, holdbacks, options, existing grants and disputes, optionally linked to `bridge_deals`.
- `bridge_buyer_requirements`: buyer's category, territory, language, monetisation, timing and technical requirements.

All new tables enable RLS with no client policies. They are intentionally server-only until authenticated admin APIs and buyer-safe projections are implemented. The migration must not be applied to the shared production Supabase project until reviewed, CI passes, Preview is verified and a migration plan is approved.

## Buyer discovery contract

Match a buyer requirement against individual rights records, territories, language scopes, dates, exclusivity, evidence and active commitments. Return an explainable outcome (eligible, partial match, blocked, or diligence required). Do not expose internal notes, source contracts, private buyer details, or another buyer's offers. A category match alone must never make a title buyer-ready.

## Publication boundary

**Bridge authorizes → Loop delivers.** A signed deal is not itself a Loop publication grant. Publication still requires an explicit valid grant with scope, dates, approval, technical readiness and revocation/expiry checks at runtime.

## Delivery status

This PR establishes the schema/catalog foundation only. It does not apply a Supabase migration, write title-rights data, alter production, expose a new UI, or claim buyer matching / Loop runtime enforcement is complete.
