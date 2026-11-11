# StreamVista Amazon Prime Video onboarding and Bridge integration plan

**Date:** 2026-11-11  
**Scope:** Prime Video Direct self-service + Managed Prime Video Partner onboarding  
**Territory target:** Every territory explicitly enabled for the StreamVista account and verified against current Amazon Avails  
**Spend:** ₹0; no paid upgrades, vendors, plugins, or services  
**Release boundary:** Isolated feature branch only. No merge, Production deployment, Production DB writes, or live submission.

## 1. Outcome

Make Amazon Prime Video a first-class external Buyer / Distribution Channel in Crayons Bridge. Studio users prepare a rights-cleared title in the existing Studio Dashboard and choose an approved Amazon route. Bridge validates the package and hands it to the authorized Amazon workflow. Amazon remains the authority for account eligibility, territory Avails, licensing decisions, delivery acknowledgements, storefront publication, and financial reporting.

Amazon Slate consolidates Video Central and Prime Video Direct account/content workflows. Prime Video Direct self-service is free, but account setup, company profile, banking and tax onboarding are required before content submission and payment. Managed partner access is a separate Amazon-approved commercial/technical onboarding route.

## 2. Two partner tracks

### Track A — Prime Video Direct (self-service)
1. StreamVista's authorized company representative signs in to Prime Video Slate using an Amazon account.
2. Create/complete the StreamVista company profile and legal/address details.
3. Complete payee, bank and tax interviews shown for the account and contract.
4. Review the account's actual Availability / Avails tab and supported offer types. Record only territories shown for this StreamVista account.
5. Prepare one rights-cleared pilot film and required localized assets.
6. Submit for licensing consideration using the available self-service tools and record Amazon's actual submission reference/status.
7. Track Amazon review, selected/rejected/needs-fix, delivery and live status separately.

No automation may claim to submit directly through PVD unless Amazon exposes and authorizes that exact interface for the account. Otherwise Bridge provides a guided manual handoff and evidence capture.

### Track B — Managed Prime Video Partner
1. Contact Prime Video through the official Slate Contact Us / existing business contact route.
2. Request managed content-partner onboarding for StreamVista OPC Pvt Ltd and explain Bridge's B2B content supply-chain workflow.
3. Provide organization name, business alias if known, titles/catalog size, content types, business lines sought, intended territories (subject to rights), technical delivery capability, and partner/vendor preference.
4. Request written confirmation of contract model, enabled territories/Avails, offer types, account permissions, delivery method, technical specifications, sandbox and production environment access, API eligibility, reporting and financial setup.
5. If accepted, complete Amazon's technical scoping, Slate user access, training and test delivery.
6. Request Content API Suite access separately. Amazon documentation currently says Content API Suite access is for managed Prime Video partners; API onboarding is not assumed.
7. Choose authorized direct delivery or a Preferred Fulfillment Vendor (PFV). Direct delivery requires XML automation and Amazon's approved transfer method; PFV delivery is an alternative. No PFV is selected or paid for in this plan.

## 3. Territory and offer policy

- Do not hard-code Prime Video consumer-service country coverage as publishing eligibility.
- Do not assume worldwide or 240+ territory availability.
- Territory eligibility is per StreamVista Amazon account, contract, title rights, offer type, language/localization and current Avails evidence.
- Store source, evidence reference, checked timestamp and validity/refresh timestamp for each territory/offer.
- Missing, stale, contradictory or unavailable Avails = NOT VERIFIED and submission blocked.
- Require title rights evidence and validate territory, offer type, term, exclusivity and holdbacks.
- Offer types must be enabled by the relevant Amazon contract. TVOD, SVOD/Channels and free offers are not interchangeable.

## 4. Bridge Studio Dashboard experience

Keep this inside the existing Studio Dashboard; do not create a separate DIT login.

**Amazon Buyer workspace**
- Partner mode: PVD self-service / managed Slate (only enabled after evidence).
- Account onboarding checklist and permission state.
- Territory Avails matrix with source and last-checked date.
- Offer type and localization requirements per territory.
- Title readiness: QC, rights, mezzanine, audio, captions/subtitles, artwork, metadata.
- Submission package preview and downloadable handoff manifest.
- Manual handoff instructions until an authorized integration exists.
- Submission timeline: Draft → Blocked → Ready for handoff → Handed off → Submitted → Needs fixes / Accepted / Rejected → Delivered → Published.
- Per-territory and per-offer status, Amazon reference, timestamps and validation evidence.
- Studio notifications, action-required items, revenue/reporting references when Amazon supplies them.

**Critical status rules**
- Handed off is not Submitted.
- Submitted is not Accepted/Selected.
- Accepted/Selected is not Delivered.
- Delivered is not Published.
- Only Amazon-confirmed storefront-live evidence may produce Published.
- Never announce or market a title as available before Amazon confirms publication.

## 5. Integration architecture (gated)

1. Keep domain rules in the existing `src/lib/bridge/amazon-prime-video.ts` module; expand with tests before UI wiring.
2. Add an adapter interface with separate implementations: manual PVD handoff and managed Slate provider adapter.
3. Implement the managed adapter only after Amazon provides written authorization, API specifications, credentials, and sandbox access.
4. Use Amazon Content API Suite only if StreamVista receives approval and credentials. Its documented capabilities include Avails, Offer Status, Asset Status and Notifications APIs.
5. Keep secrets server-side in approved existing secret storage; never commit secrets, expose them to the browser, or use personal Amazon login credentials as application secrets.
6. Add idempotency, retry limits, webhook/notification verification, audit trail, least privilege, tenant isolation and reconciliation.
7. Persist provider events with source references and timestamps; unknown provider statuses fail closed.
8. Do not invent API endpoints, XML schemas, transfer buckets, S3 credentials, certificates or partner identifiers.

## 6. Pilot acceptance criteria

- A StreamVista authorized Amazon account exists and its partner mode is evidenced.
- Account-specific territories and offer types are captured from Amazon Avails.
- One pilot title has verified rights, QC, localization and required technical assets.
- The Bridge package manifest passes automated validation.
- Manual handoff is accurately recorded if no API is authorized.
- If managed API access is approved, sandbox tests pass before any production credentials or live submission.
- Status transitions and evidence are auditable, including partial territory acceptance, rejection, missing assets, expired rights, duplicate handoff and delayed storefront publication.
- Existing Bridge workflows show no regression.

## 7. Work gates and environment controls

| Area | Action | Access | Risk / gate |
|---|---|---|---|
| GitHub feature branch | Add plan and implementation/tests | WRITE, isolated branch | Medium; no merge |
| STAGING DB — Bridge Testing DB | Inspect schema compatibility only | READ-ONLY | No migrations or data writes without separate approval |
| PRODUCTION DB | No action | READ-ONLY / HOLD / NOT CERTIFIED / NO-GO | No writes, migrations, secrets, or schema changes |
| Vercel Bridge | No deployment | No deployment action | Production remains untouched |
| Amazon | Public onboarding research and preparation only | No account login/submission | Partner approval, Avails, credentials and live submission NOT VERIFIED |
| Paid services | None | ₹0 | No vendor or paid upgrade |

## 8. Current evidence

- PASS: existing isolated branch `feat/amazon-prime-video-publishing-20261111`.
- PASS: existing pure eligibility/domain module read back from the branch.
- NOT VERIFIED: build, typecheck, lint and automated tests for the new module.
- NOT VERIFIED: StreamVista Amazon PVD account, company profile, banking/tax onboarding, partner permissions and actual Avails.
- NOT VERIFIED: managed partner acceptance, API access, sandbox credentials and delivery method.
- BLOCKED: automated Amazon submission and live publication until Amazon authorizes the account and interface.
- HOLD: merge and Production deployment.

## 9. Official Amazon references

- Slate getting started: https://videocentral.amazon.com/support/welcome-to-prime-video-slate/getting-started
- Prime Video Direct provider onboarding (free self-service; profile, banking/tax, content and assets): https://videocentral.amazon.com/support/welcome-to-prime-video-slate/getting-started/self-publishing-contract-partners?language=en_US
- Prime Video Direct overview: https://videodirect.amazon.com/home/landing?language=en_US
- Managed VOD onboarding and delivery paths: https://videocentral.amazon.com/support/welcome-to-prime-video-slate/getting-started/launching-video-on-demand-content
- Content API Suite onboarding and managed-partner eligibility: https://videocentral.amazon.com/support/api-onboarding?language=en_US
- Self-publishing submission requirements and select marketplaces: https://videocentral.amazon.com/support/delivery-experience/licensing-rights-and-avails/submission-requirements

---
**Decision:** Proceed with both partner tracks, account-verified territories only, ₹0 spend, and isolated implementation. No Production changes or live Amazon submissions are authorized by this plan.
