# Crayons Bridge — Simple submission and rights workflow

## Default routing
Every Creator/Studio title submission enters the private **Bridge Admin intake queue** first. It is not delivered to buyers and is not published to Crayons Loop on submission.

Recommended status flow:
- Submitted → Bridge Admin intake
- Intake complete → QC queue and Rights queue (separate reviews)
- QC passed + Rights cleared → Commercial/distribution review
- Agreement accepted + commercial terms set → Admin publication approval
- Published → buyer catalogue
- Buyer licence + payment confirmation → entitlement and controlled delivery

The actual status names must map to the existing canonical title and gate records. Do not add a parallel application lifecycle or duplicate title records.

## Simple owner form
1. **Film details:** title, format, original language, country, year, runtime and synopsis.
2. **Original version:** original audio language(s), existing dubbed audio, existing subtitles.
3. **Rights for Bridge to review:** requested territories, distribution media, start/end dates and exclusivity.
4. **Authority:** who is submitting and what document proves the authority.
5. **Buyer intent:** optional audience/channel preferences and screener availability.

Synopsis limit: 250 words, enforced by both browser and server validation.

## Language model
Keep three separate concepts:
- Original master audio: language(s) actually present in the supplied master.
- Existing dubbed audio: language assets already produced and supplied.
- Subtitle languages: subtitle assets already produced and supplied.

A request for dubbing or subtitling is a **service/localisation request**, not proof that the owner grants those language rights. Bridge must not turn requested languages into valid distribution grants automatically. Legal review records each right type (original, dubbing, subtitling) and its evidence separately using the existing multilingual-rights model.

## Rights territory and media
Use an easy selection UI, but store normalized values that the existing rights schema and downstream package validation accept. Include:
- Territory: India, GCC, US, Canada, UK, Australia, Worldwide, Other (Other requires explicit country/region).
- Media: OTT streaming, SVOD, TVOD, AVOD/FAST, digital download, satellite, broadcast TV, theatrical, YouTube, music/audio, physical distribution, educational, airline/ancillary, festival/screening.

Worldwide is exclusive of individual territory choices. Selecting Worldwide must clear/disable individual territories; adding another territory must clear Worldwide.

Do not interpret a blank selection as worldwide. Do not infer rights from original-language selection.

## Proposed Bridge master-distribution appointment
The five-year master-distribution appointment is a proposed commercial agreement, not a default owner grant and not the same field as the owner's existing rights window.

The submission may record that the owner is willing to review a proposed five-year appointment. It must not create or activate a five-year rights grant. Bridge Legal/Admin must issue the agreement, confirm fee/revenue-share/exclusivity/sublicensing/territory/media and effective dates, and record acceptance by authorized parties before any authority is treated as active.

## Safeguards
- Never expose a title to buyers because it was submitted.
- QC and Legal decisions remain separate, explicit and audited.
- A rights request is not an approved right.
- Screener access never grants master download.
- No automatic five-year rights grant.
- No production schema or deployment change from this specification.
