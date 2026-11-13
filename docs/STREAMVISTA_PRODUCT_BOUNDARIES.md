# StreamVista ecosystem — product and experience boundaries

**Status:** implementation architecture baseline  
**Applies to:** Crayons Bridge and Crayons LOOP  
**Release posture:** documentation/source contract only; this file does not certify Production.

## Ecosystem map

StreamVista is the parent company and ecosystem owner. It is not a third consumer application in this release scope.

### Crayons Bridge — business and rights platform
Canonical public domain: `https://www.crayonspictures.in`

Bridge is the system of record and staff control plane for:
- Creator and Studio onboarding, submissions and title workspaces
- Investor-facing participation and reporting, subject to role and deal scope
- Buyer discovery, licensing, contracts and delivery
- Admin / Operations: ingest, asset versions, technical QC, legal clearance, rights, territories, languages, commercial approvals, publication, revocation and audit
- CMS and operational controls for LOOP publication and consumer merchandising inputs

Bridge alone authorizes whether a title/package may be published to LOOP. UI hiding is not authorization; every action and read must be server-enforced by identity, role, organization, title and grant scope.

### Crayons LOOP — consumer entertainment product
Canonical public domain: `https://crayonsloop.in`

LOOP owns consumer discovery, presentation, account/profile experience, watch state, protected playback and consumer TVOD rental/entitlements. It is not a second rights office, master-ingest tool, B2B licensing desk or privileged Bridge admin console.

## LOOP experience channels

The channels are clients of one LOOP product and one controlled backend contract; they are not separate products or databases.

| Channel | Boundary | Evidence / release posture |
| --- | --- | --- |
| Web | Consumer browser experience | Existing web application |
| Mobile App | Mobile consumer client | Existing PWA/install path is not proof of a separately released native iOS/Android app |
| TV App | Remote-first television client | Android TV foundation exists in LOOP source; it is not by itself proof of a certified/store-released app |
| Infotainment | Future in-vehicle / connected-display client category | Not certified or implemented by this architecture note; no vehicle OEM, Android Automotive, CarPlay or driver-distraction integration is implied |

An experience channel may be enabled only after its client, authentication, playback, device security, accessibility, store/OEM and release requirements are separately tested. No channel may bypass the LOOP server authorization contract.

## Shared backend and trust boundaries

Use only the existing approved Supabase projects and current canonical production project. Do not create a new project, duplicate Auth authority, duplicate entitlement ledger or second publication database.

- Bridge owns private business, rights, QC, deal, master-asset and operator records.
- LOOP clients receive only consumer-safe, Bridge-authorized publication data through approved server/API paths.
- Browser clients never receive service-role, OCI, Razorpay secret or other privileged credentials.
- LOOP must not query Bridge internal tables as a substitute for a controlled publication API.
- Shared Auth does not imply cross-domain browser session sharing. Any SSO must use an explicit, short-lived, verified handoff; never copy tokens through query strings or local storage across origins.
- Preview must use the approved isolated Testing DB. Preview must fail closed on missing, mixed or Production database configuration.

## Authoritative publication lifecycle

`Bridge review → QC passed → legal/rights approved → package complete → curation approved → delivery ready → Bridge publish authorization → LOOP acknowledgement → consumer catalog`

The publication package must be versioned and scoped to title, approved metadata/assets, territories, languages, validity window and exploitation model. Revocation/expiry must stop new playback authorization and reconcile downstream visibility.

## Release rules

1. No Production promotion without exact Git SHA, green required CI, matching Vercel READY deployment and Preview end-to-end evidence.
2. Verify Bridge/LOOP role isolation, publication, territory, TVOD and protected playback.
3. Review RLS, grants and SECURITY DEFINER RPCs table/function by table/function; never apply blanket grants or revokes.
4. No mock data or unsupported client, store, DRM, codec or device capability claims.
5. Production remains HOLD whenever evidence is missing or a gate is FAIL/BLOCKED.

This architecture contract is additive to the existing Bridge production architecture lock and Bridge→LOOP binding addendum; it does not override their stricter release gates.
