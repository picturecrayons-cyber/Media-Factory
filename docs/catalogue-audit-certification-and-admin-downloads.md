# Crayons Bridge — Film Catalogue Audit & Certification

**Decision: NOT CERTIFIED — catalogue-wide release HOLD.** This report records external identity research and required operational checks. It is not proof of title ownership, file integrity, chain of title, or publication authorization.

## Super-admin audit workflow

For every canonical title ID, the admin workspace should display the audit result beside the title name and poster thumbnail:

- **Film identity:** matched / ambiguous / unverified, with source links and the exact title, language, year, director, and production company used for matching.
- **Record integrity:** canonical / legacy placeholder / possible duplicate / test record.
- **Release readiness:** master asset, poster/artwork, checksums, QC, rights grant, licence window, TVOD permission, and publish gate evidence.
- **Decision:** PASS / HOLD / REJECT, timestamp, auditor, evidence references, and reason. External title matches alone must never produce PASS.

## Super-admin downloads

The authenticated super-admin should be able to download individual files and a title-level evidence bundle from the existing title workspace. Use server-authorized, short-lived signed downloads from the canonical OCI storage backend; do not expose raw object keys or permanent public URLs. Verify the user's super-admin role and title-level authorization server-side on every request. Record an audit event for downloads. Provide a clear unavailable/error state when an asset is missing or a signed URL cannot be issued.

The title gallery should show actual stored poster/artwork thumbnails using authenticated or short-lived preview URLs, with a fallback when no asset exists. Do not substitute externally discovered film posters for the title's stored artwork or represent a search thumbnail as verified title media. Add download actions for each asset and a manifest containing canonical title ID, asset role, filename, MIME type, byte size, checksum, storage verification status, and generation time. Do not bundle rights-restricted assets unless the user is authorized to download them.

## Initial catalogue findings supplied for investigation

### Identity matches to re-confirm against the canonical records

| Title | Bridge ID | Initial finding |
|---|---|---|
| Kuruvi Paapa | `9333cc7ecf3dca99251f25b5d2cdb0b2` | Reported 2024 Malayalam film; verify exact credits. |
| Anjaam Vedham | `fb47fe2196d43f8022f3b8a4ba85edc0` | Reported 2024 Malayalam drama; match production credits. |
| Vaathil | `8dd4886567a00fe97379ab8514fffa87` | Reported 2023 Malayalam film; match record metadata. |
| Kolahalam | `eea9498d15285973eee2c6714dd583e1` | Reported 2025 Malayalam comedy; match credits. |
| Koodal | `legacy-film-7` | Reported 2025 Malayalam thriller; **identity conflict to investigate**. |
| Jananam: 1947 Pranayam Thudarunnu | `cb8c141dc72d727a53a4f35d8851e100` | Reported 2024 Malayalam film. |
| Malayalakkara Residency | `858f0ec5a11bc9acd2e9c20266541a3a` | Reported 2014 Malayalam film. |
| Nigoodam | `b53f5265bd87583b82b456962aa225d2` | Ambiguous: similarly named productions reported; disambiguate. |
| The Protector | `14c4d2e3791e26ee3244f7b437bcf43b` | Reported 2025 Malayalam film; match official credits. |
| DNA | `1efedf51832cfa4cd5d3e116638a6a5e` | Reported 2024 Malayalam film; match intended production. |
| Jamalinte Punchiri (Jamal's Smile) | `legacy-film-56` | Reported 2024 Malayalam film. |
| Jami | `legacy-film-67` | Reported CBFC-listed Malayalam film; match credits. |
| ISHA-Malayalam Horror | `legacy-film-66` | Partial match only; title/production identity unresolved. |
| Bahumukham – Good, Bad & The Actor | `legacy-film-37` | Reported 2024 Telugu film; catalogue language says Telugu. |
| SHRI BALAJI PHOTO STUDIO | `legacy-film-48` | Possible Kannada original / Malayalam-dubbed version; verify licensed version. |
| Swapna Sundari | `2a650c8ba052151feaa0dc262e3b9b94` | Year mismatch reported; unresolved. |

### Records requiring investigation

| Title | Bridge ID | Required evidence |
|---|---|---|
| AANDAAL | `ee89fc64c7cb17b2bb5fcede0f7ea869` | Official credits and exact production identity. |
| Pranayam 1947 | `f15e0a5385aaf8365f6ad730de747da0` | Compare with Jananam: 1947 Pranayam Thudarunnu; no merge/delete without owner evidence. |
| Sevagramam | `28ef44b9694d6771c7d5b23bb87a6735` | Production, release status, master asset. |
| Pazhuth | `e9ff96cacd87a98f38e07e62e44fb7b6` | Production identity and 2026 year evidence. |
| The Second Home | `legacy-film-62` | Original-language title, director or production company. |
| Kombal | `legacy-film-53` | Production credits or authoritative listing. |
| Imran 3:185 | `legacy-film-47` | Exact spelling and production identity. |
| Ama | `legacy-film-52` | Country, director, year to disambiguate. |
| GOD FREQUENCY | `legacy-film-57` | Production identity and language. |
| Chicken Curry | `legacy-film-58` | Credits and release year. |
| Lunch Break | `legacy-film-59` | Production identity and source evidence. |
| Buffering | `legacy-film-60` | Disambiguate title and production. |
| Heal – Note to self | `legacy-film-61` | Exact title, producer and release details. |
| Ali's Nature | `legacy-film-9` | Verify Turkish origin and claimed 2021 release. |
| Civilian | `legacy-film-8` | Verify Turkish origin and claimed 2014 release. |

### Integrity flags

- `bridge-oci-e2e-7be3ab166df28709` — `INTERNAL TEST ONLY — OCI Storage E2E`: isolate from buyer-facing listings and production metrics. Do not delete automatically.
- `legacy-film-7` Koodal is reported as `LIVE FOR BUYERS`, while the separate Jananam record exists and `Pranayam 1947` may be related. Resolve identity using original production credits and asset checksums before any rename, merge, or deletion.
- Newly created records with missing original title, year, runtime, director, or producer remain identity-review items.

## Execution and certification status

The read-only audit script is available at `scripts/catalogue-audit.mjs`. It must be run against the intended staging database with a read-only credential. A successful script run is only a metadata gate check; it does not certify the actual film, asset contents, ownership, legal rights, or publishing authorization. The current release decision remains **HOLD** until all blockers are resolved and verified end-to-end.

## Acceptance criteria for the admin feature

1. All catalogue records are shown with canonical ID, actual stored thumbnail (or explicit missing-thumbnail state), and PASS/HOLD/REJECT audit state.
2. Admin can open the full record and see source links, evidence checklist, blockers, and audit history.
3. Super-admin can download each authorized stored asset and a manifest/evidence bundle via short-lived signed URLs.
4. Missing assets, expired links, permission failures, and checksum mismatches produce explicit errors and audit events.
5. Test titles and unresolved records cannot be published; no automatic deletion or merge occurs.
6. End-to-end tests cover role separation, downloads, thumbnail access, failed/expired URLs, publication blocking, and audit-log creation.
7. Certification stays HOLD until the tests pass against staging and legal/asset evidence is reviewed.
