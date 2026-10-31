# Crayons ecosystem business opportunity

## Customer-facing offer

Crayons Bridge is the B2B operating layer for audiovisual rights, content preparation, licensing workflows, buyer access, and delivery coordination. The public media-services page introduces three service areas:

1. Rights and licensing operations.
2. Content preparation and delivery coordination.
3. Media insurance-readiness documentation, for review and placement by appropriately authorised insurance professionals.

Do not publish customer counts, revenue claims, coverage guarantees, vendor availability, service-level guarantees, or price lists unless verified and approved.

## Application boundaries

- **Bridge** is the authority for title records, rights evidence, QC/review state, licensing, and publication authorisation.
- **Loop** is the consumer distribution and monetisation surface. It must consume Bridge-authorised publication grants and must not independently create rights authority or publish unapproved titles.
- **StreamVista OPC Pvt Ltd** may act as contracting/operating entity only where the legal, tax, IP, and commercial arrangements support that role. Do not imply that all brands are automatically insured or legally interchangeable.

## Media insurance-readiness controls

Bridge may organise user-supplied documents and evidence such as rights records, production information, contracts, vendor responsibilities, cyber/security controls, and existing policy certificates. The workflow must label evidence as submitted, pending review, verified, expired, or missing only when the underlying evidence supports that status.

The service is not underwriting, insurance advice, brokerage, policy issuance, or a coverage guarantee. Any regulated advice, recommendation, referral arrangement, or placement must be handled in compliance with applicable law by appropriately authorised professionals. Do not calculate or represent a premium quote as an insurer quote.

## Payments and commercial claims

- Do not introduce insurance-placement fees or commission flows before regulatory and legal review.
- Razorpay integration remains for eligible Loop customer payments and any separately reviewed service-payment workflow; never treat order creation as captured payment.
- A listed service is an offer/area of capability, not proof that a live vendor is connected or that a service has been completed.
- Do not create customer test charges or modify production payment configuration as part of this page.

## Release gates

1. Review the route and copy, including legal review of insurance language.
2. Run exact-head CI and all relevant tests.
3. Verify the matching Vercel Preview is READY and manually inspect desktop/mobile navigation and content.
4. Verify no change to the canonical Supabase project `mlmgugivsyoxzdgwkbpu`, RLS, title rights, publication grant, Loop payment, or production environment configuration.
5. Keep the PR unmerged and do not promote/deploy to production until CI, Preview, and explicit release approval are verified.

## Next implementation items

- Add a discoverable link from the public Bridge home/navigation after design review.
- Review the existing Bridge vendor-job/workspace PR separately; it is a foundation and currently documents missing quote approval, payment verification, vendor assignment, deliverable security, and StreamVista receiver integration.
- Define data model, permissions, retention, and audit requirements for an insurance evidence workspace before creating tables or storing sensitive policy documents.
- Keep Loop UI consumer-focused; no insurance workspace or B2B rights administration belongs in Loop.
