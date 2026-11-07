# Preview Pilot Capability Matrix — Bridge → LOOP One-Title Delivery Proof

**Tracking issue:** [#277](https://github.com/picturecrayons-cyber/Media-Factory/issues/277)  
**Related blockers:** [#270 — OCI CopyObject permissions](https://github.com/picturecrayons-cyber/Media-Factory/issues/270) · [#271 — upload progress and recovery UX](https://github.com/picturecrayons-cyber/Media-Factory/issues/271)  
**Review snapshot:** 18 October 2026  
**Status:** Initial repository-evidence draft; engineering and rights-owner review required  
**Release posture:** **Production HOLD — unchanged**

> This document distinguishes repository design/code evidence from verified runtime behavior. A code path, test fixture, UI label, green build, or intended architecture is not proof that a real Preview delivery succeeded. Unless a row cites a successful, current, exact-environment end-to-end result, treat runtime capability as unverified. Do not use a real title or asset until its owner, authority, scope, and pilot authorization have been documented and reviewed.

## Status vocabulary

- **VERIFIED** — the stated behavior has current, reproducible evidence for the exact scope/environment named.
- **PARTIAL** — some implementation or design evidence exists, but a dependency, end-to-end path, or acceptance proof is missing.
- **MANUAL** — requires documented human/legal/commercial review; software fields or status labels cannot replace that decision.
- **BLOCKED** — a known blocker prevents relying on the capability for this pilot.
- **UNKNOWN / NOT VERIFIED** — evidence is absent, stale, ambiguous, or not inspected sufficiently.

A source file can support a **PARTIAL** status; it does not alone justify runtime **VERIFIED**.

## System boundary

- **Crayons Bridge** is the B2B control plane and authority for title records, rights/legal review, QC, licensing, commercial approvals, package authorization, delivery state, and revocation.
- **Crayons LOOP** is the consumer catalogue/playback and entitlement surface. It must consume only a Bridge-authorized, versioned publication package; it is not the rights authority.
- Canonical production media storage is documented as Oracle OCI Object Storage in Mumbai. AWS S3 code is documented as legacy compatibility/test code, not production readiness evidence.
- Use the existing canonical application/backend and Supabase project. Do not create a second title authority, backend, or Supabase project.

**Architecture references:** [README.md](../README.md), [Bridge → Loop binding addendum](./BRIDGE_LOOP_BINDING_ADDENDUM_V1_1.md), [release-readiness gates](./release-readiness.md), and [AADVIK Bridge → Loop workflow](./film-submissions/AADVIK_THE_UNFINISHED_STORY_BRIDGE_LOOP_WORKFLOW.md). These documents describe intended boundaries and release requirements; they do not certify this pilot.

## Capability matrix

| Capability / stage | Authority | Status | Evidence currently available | Automatic evidence vs manual review | Owner / exit criterion |
|---|---|---|---|---|---|
| Canonical Bridge title record and stable title identity | Bridge | PARTIAL | README identifies Bridge as title authority; src/lib/bridge/assets.ts loads title records by ID and links assets to title IDs. | Code stores/uses IDs; exact title/version mapping for a pilot still needs record-level proof. | Engineering: identify the exact title UUID and verify metadata/asset references in the approved Preview environment. |
| Applicant/rights-owner identity and signatory authority | Bridge + rights owner | MANUAL | The AADVIK workflow explicitly treats applicant-provided details as unverified until evidence is reviewed. | Identity documents, authority-to-sign evidence, and any representation mandate require human review. | Rights owner: document identity, legal entity, authority basis, reviewer, date, and source reference. |
| Chain of title and agreement scope | Bridge + rights owner | MANUAL | docs/BRIDGE_LOOP_BINDING_ADDENDUM_V1_1.md describes rights and licensing dimensions; docs/film-submissions/AADVIK_THE_UNFINISHED_STORY_BRIDGE_LOOP_WORKFLOW.md specifies evidence intake and review. | Contract/assignment documents and scope interpretation are manual legal review. Existence of a database row is not legal validation. | Rights/legal reviewer: record agreement version, parties, relevant clauses, review outcome, and unresolved issues. |
| Territory, language, platform, business model, term/window, exclusivity, sublicensing | Bridge | PARTIAL | src/lib/bridge/delivery-traces.ts reads destination-package and rights-grant fields including territories, languages, media, window, commercial model and exclusivity. | Structured fields may be read automatically; whether signed evidence authorizes the exact requested combination requires human review. | Engineering + rights owner: compare the signed grant with the exact destination/scope and test fail-closed behavior for mismatch, expiry, or revocation. |
| Music, footage, performer, artwork and other third-party clearances | Bridge + rights owner | MANUAL | Rights intake and clearance expectations are documented in the AADVIK workflow and binding addendum. No pilot-specific clearance packet is cited here. | Clearance documents, limitations and exceptions require human review. | Rights owner: itemize relevant third-party materials, proof/attachment references, restrictions, and reviewer decision. Missing or conflicting proof blocks the title. |
| Technical QC of the exact asset/version | Bridge | PARTIAL | Repository documentation separates technical QC from legal approval; docs/release-readiness.md requires real authenticated E2E evidence for release gates. | Some checks may be automated, but the exact asset's QC report, issue list, version and final reviewer decision must be linked. | QC owner: attach actual report and version-specific pass/fail evidence. Untested checks remain UNTESTED. |
| Signed upload request and asset confirmation path | Bridge / OCI | PARTIAL | src/lib/bridge/assets.ts implements authenticated requestAssetUpload and confirmAssetUpload server functions, validates actor/title/status and records an audit event. | Server responses and audit records may be automatic; code inspection is not proof of a successful transfer or correct read-back. | Engineering: verify each intended asset type in a controlled Preview using a disposable, authorized fixture and record safe request/correlation IDs. |
| OCI object verification and immutable sealing/copy | Bridge / OCI | BLOCKED | src/lib/bridge/assets.ts invokes object verification and sealing; issue #270 records InsufficientServicePermissions on OCI CopyObject and requires scoped remediation plus disposable-object retest. | ETag/object metadata and copy work-request results can be machine evidence; successful integrity requires read-back/byte comparison and recorded test results. | OCI/engineering owner: resolve permissions only after tenancy/bucket/region verification; test one disposable Preview object and prove destination HEAD/ETag, download and integrity. No production IAM changes under this task. |
| Asset mapping, source/version, checksum/ETag and storage reference | Bridge | PARTIAL | src/lib/bridge/assets.ts persists asset/title/key metadata and requires an ETag for immutable verification in the inspected code path. | Stored keys/ETags can be automatic; correspondence to the intended source/version requires evidence and controlled comparison. | Engineering: record title UUID, asset ID/kind, version/source, safe object reference, expected/observed integrity result, and verification time. |
| Delivery package and destination-specific authorization | Bridge | PARTIAL | src/lib/bridge/delivery-traces.ts reads destination package readiness and linked rights-grant scope; addendum defines destination-specific authorization. | Package state and linked IDs may be machine-readable; a valid grant, QC, legal and commercial gates must be reviewed and verified before authorization. | Engineering + rights owner: prove exact destination package, rights-grant reference, approved asset versions, recipient specification and authorization event. |
| Bridge-to-LOOP publication and acknowledgement | Bridge authorizes; LOOP consumes | PARTIAL | docs/release-readiness.md requires both bridge_loop_publications and loop_titles, plus a real authenticated flow and visible LOOP catalog result. | Database rows/catalog visibility can be observed; correct playback authorization and rights scope require end-to-end testing. No current pilot success evidence is cited here. | Engineering: prove exact versioned publication, destination rights scope, visible catalog result, and playback eligibility using an authorized test title. |
| Delivery manifest, receipt, buyer acceptance and exception report | Bridge + recipient | UNKNOWN / NOT VERIFIED | Proposed pilot outputs include these records, but no current source/evidence cited in this matrix proves that every output is implemented and persisted for this pilot. | Manifest/receipt/audit capture must be demonstrated; buyer acceptance and exception disposition require a named accountable human. | Engineering + buyer owner: inventory actual generated records; mark unsupported outputs NOT IMPLEMENTED; define acceptance owner and retain evidence references. |
| Upload progress, terminal status and recovery after refresh | Bridge | PARTIAL | Issue #271 records observed Preview UX gaps, including ambiguous upload outcomes and recovery. | UI states/logs can be automatic; user observations are not independent runtime/log verification. | Engineering: test each in-scope asset type, refresh/reopen, duplicate prevention, verified terminal state, and safe actionable failures in Preview. |
| Studio slate titles and production-services request list | Bridge Studio | UNKNOWN / NOT VERIFIED | Prior operator observations reported that the slate could not load titles and the production-services list could not load requests. These observations have not been independently reproduced in this matrix. | Browser observations, request IDs and safe server logs should be captured during reproduction. | Engineering: reproduce in Preview with account/role, time, request/correlation ID and redacted error evidence; do not assume fixed. |
| Evidence integrity, provenance and retention | Bridge | PARTIAL | src/lib/bridge/assets.ts writes an audit event for signed upload requests; repository docs require auditable sensitive actions. | Audit events may be automatic; completeness, retention, access controls and linkage across authorization → delivery → acceptance are not certified here. | Engineering/security: demonstrate a traceable evidence chain for one authorized Preview fixture and confirm secret/private-data redaction. |
| Credentials, signed URLs, PAR URLs and private legal material redaction | Bridge / operators | UNKNOWN / NOT VERIFIED | Repository guidance requires sensitive rights documents and master assets to remain private; no specific redaction test result is cited here. | Must be verified through logs, UI, error responses and test assertions. | Security owner: prove credentials, private keys, tokens, signed/PAR URLs and private legal documents do not leak into logs or buyer-visible views. |
| Commercial approval and explicit pilot authorization | Bridge + authorized approver | MANUAL | Binding addendum and release-readiness docs require rights, QC, legal, package and required commercial/authorization gates. | Written approval, agreed pilot scope, intended recipient and exclusions require accountable human approval. | Authorized commercial/rights owner: record who approved what title/version, recipient, scope, environment, permitted use, validity period and evidence location. |
| Buyer acceptance and pilot close-out | Buyer + Bridge | MANUAL | Proposed pilot process calls for named buyer acceptance criteria and a Pilot Decision Record; no actual buyer acceptance is asserted here. | Human buyer sign-off must cite tested criteria and any exceptions; verbal interest is not technical certification. | Named buyer owner + Bridge operator: record criterion-by-criterion result, evidence references, exceptions, decision, owner and date. |

## Minimum evidence packet for a single Preview pilot

Complete before a real title is used:

- [ ] Title UUID, display/original title, version, language, runtime, year and intended recipient are recorded.
- [ ] Rights owner and signatory authority are evidenced.
- [ ] Chain of title/agreement and the exact territory, platform, media/business model, term/window, exclusivity and sublicensing scope are reviewed.
- [ ] Relevant music, footage, performer, artwork and other third-party clearances are documented.
- [ ] QC decision references the exact asset versions.
- [ ] Written pilot authorization names the Preview environment, permitted use, recipient, scope, expiry and exclusions.
- [ ] A controlled test plan identifies the asset fixture, expected destination, integrity checks, stop conditions and cleanup scope.
- [ ] Evidence owner and buyer acceptance owner are named.
- [ ] All required artifacts are linked; unavailable artifacts are marked **MISSING / NOT TESTED**, not passed.

Prefer a synthetic or explicitly authorized test asset when any real-title rights question remains unresolved. A screener is not permission to download or redistribute a master.

## Acceptance decision tree

1. **Rights/authority/scope missing, expired, contradictory or out of scope?** → **PAUSE**. Do not authorize delivery.
2. **Any required clearance, QC, package mapping or commercial approval missing?** → **PAUSE**. Assign an evidence owner and due date.
3. **OCI copy/seal, storage read-back, integrity, or safe upload recovery unverified?** → **PAUSE**. Do not claim a verified delivery.
4. **Any mismatch, unauthorized access, secret/data leakage, or production mutation required?** → **STOP** the pilot, preserve safe evidence, escalate, and keep Production HOLD.
5. **Every mandatory gate passes with evidence and the recipient/scope is authorized?** → A responsible owner may approve the controlled Preview pilot within the documented scope.
6. **Buyer acceptance incomplete or evidence absent?** → Close as **NOT ACCEPTED / INCOMPLETE**, not success.

## Evidence capture checklist

For each test, record only safe, non-secret details:

- Run date/time and operator; account role and Preview environment/deployment/commit.
- Title UUID and asset IDs/version/kind; recipient and approved scope.
- Authorization/grant reference and reviewer decision.
- Request/correlation IDs, safe status/error codes and timestamps.
- Expected versus observed asset/object state; ETag/checksum/integrity result where available.
- Actual package/manifest/receipt/QC/exception artifacts and stable evidence links.
- Buyer acceptance criteria, per-criterion status, reviewer/owner and decision.
- Redactions applied and any limitations or untested cases.

Never paste credentials, private keys, access tokens, signed URLs/PAR URLs, or private legal documents into issues, logs, screenshots, or buyer-facing evidence.

## Production HOLD — non-negotiable

This documentation and any Preview pilot do **not** authorize:

- Production publication, distribution, licensing grants, consumer entitlements or paid access.
- Production credentials, environment configuration, storage permissions, IAM policies or secrets changes.
- Database migrations, destructive storage operations, broad cleanup, unapproved retries, or unapproved deployment/promotion.
- Treating CI success, Preview readiness, buyer interest, a verbal statement, or buyer sign-off as Production certification.

Production remains on HOLD until all applicable release gates have current evidence for the exact release candidate, including exact-head CI, matching Preview, authenticated role-based E2E, OCI storage integrity, Bridge → LOOP publication/playback authorization, payment/webhook/entitlement checks where in scope, mail checks where in scope, and reviewed release approval. Follow docs/release-readiness.md.

## Review checklist

- [ ] Engineering confirms each code reference and updates statuses against the current commit.
- [ ] Engineering records actual Preview test evidence and distinguishes it from source inspection.
- [ ] Rights/legal owner approves the evidence checklist and scope requirements.
- [ ] Buyer acceptance owner and criterion-level sign-off format are agreed.
- [ ] Issues #270 and #271 are rechecked; blockers are not marked resolved without evidence.
- [ ] No production mutation, deployment, credential/permission change, rights grant, publication, or production storage write was performed for this documentation task.

**This document is a working readiness matrix, not a legal opinion, completed pilot report, delivery certification, or Production release authorization.**
