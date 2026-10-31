# Manual Bridge-to-Loop delivery and approval (UNI-38)

This change provides an operator-controlled delivery/acceptance record. It does not publish any title on installation, on page load, on manifest download, on delivery, or on approval. No production records are seeded or updated by this change.

## Operator workflow

1. Open the canonical Bridge title. Complete verified master/artwork ingest and manual QC in **Prepare**.
2. In **Business**, choose **TVOD** or **AVOD**, enter the actual executed agreement and ownership references, languages, explicit start/end dates and gross revenue shares. Territory remains WORLDWIDE, matching the existing consumer-region limitation. Save an immutable draft.
3. A different legal reviewer approves that license during RIGHTS_REVIEW. Saving a license does not clear QC or rights.
4. In **Distribution**, an operator with `title.deliver` selects the approved license and prepares a package version. Server preflight requires current-asset QC, approved covering rights, the legally reviewed license and commercial shares.
5. Download the private manifest when needed. Manually transfer the actual delivery materials outside the application; then record the completed transfer's evidence reference. Downloading is not delivery. The manifest contains private storage references, not signed playback URLs; never expose it as a public consumer document.
6. A different operator with `loop.publish` records Loop's explicit acceptance/rejection evidence and findings. The preparer or sender cannot review their own package. This is an auditable manual attestation of an external decision, not a buyer-login portal, email integration or automatic acknowledgement.
7. **TVOD only:** after acceptance, check the explicit publication confirmation and click **Publish accepted TVOD package**. This separate action rechecks preflight, current title/assets/license fingerprint and exact approved dimensions. Consumption of approval, catalog writes, publication and audit are one transaction.
8. A rejection requires a corrected new version. A new version supersedes older approvals. Metadata, asset-reference or license changes invalidate prior acceptance. A consumed package cannot be reused; suspension/revocation/republishing require fresh manual delivery/acceptance. Window extensions no longer silently modify approved terms: create an appropriately approved license/package instead.

## TVOD and AVOD boundary

Both models support license drafting, legal approval, versioned package preparation, manual handoff and independent acceptance. AVOD **publication is intentionally blocked** because the current consumer runtime only models FREE/SVOD/TVOD and does not enforce ad-supported playback. AVOD is never mapped to FREE. A separately implemented and verified ad/consent/entitlement integration is required before enabling AVOD publishing.

Existing TVOD pricing and playback behavior are unchanged. Catalog publication does not certify transcoding, consumer playback, third-party deployment or successful media transfer.

## Data and permissions

- `0022_bridge_loop_manual_delivery.sql` adds private `bridge_loop_deliveries` records, with title-scoped increasing versions, evidence references and actor/time attribution. No migration is executed by this PR.
- No browser RLS policies or anonymous/authenticated grants are introduced. Reads require a verified title owner/studio collaborator or internal catalog reader; buyers cannot read the private workflow.
- Reuses existing immutable license drafting and its ownership checks; `title.deliver` and `loop.publish` remain explicit staff permissions. Legal approval still requires a different legal reviewer.
- Title locks serialize package preparation, delivery, review, publication, suspension and revocation. State/version checks reject old or duplicate requests.
- The SHA-256 snapshot includes publication metadata, current master/poster references, and full approved license data. Object-key order is canonicalized for jsonb parity. Contracts/evidence affect invalidation but are not exported in the manifest.
- This gate protects the application publication entrypoint, including legacy/internal UI callers. Privileged out-of-band database edits are not an approved workflow.

## Initial title remains on hold

Jananam 1947 Pranayam Thudarunnu (Malayalam, 2024, 106 minutes) was reported as DRAFT with QC, Rights, Licensing and Publish pending. Do not invent approvals or advance this record. This PR does not create, publish or modify the title in production. Complete each real gate with evidence before any eventual publication.

## Verification

`node --experimental-strip-types --test src/lib/bridge/loop-manual-delivery.test.ts src/lib/bridge/publication-contract.test.ts`

The new suite executes actual server handlers and SQL against isolated in-memory PGLite, never production bindings. It covers no-publication-before-acceptance, self-approval denial, owner/staff permissions, AVOD preservation/hold, absent QC/legal evidence, draft lifecycle, expired rights, stale snapshots, mismatched dimensions, rejection/supersession, single-use approval and audit-failure rollback. CI runs this suite and the existing workflow suite; normal CI covers build, typecheck, lint and existing tests.

No local shell/browser was available for this implementation. Build/test/browser success must not be claimed without actual CI or isolated runtime evidence. A full independent multi-connection PostgreSQL concurrency test and browser exercise of the new controls remain release checks.
