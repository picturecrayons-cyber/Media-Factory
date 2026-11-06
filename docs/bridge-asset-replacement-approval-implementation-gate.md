# Bridge asset replacement approval — implementation gate

**Scope:** Crayons Bridge only. This branch is isolated from `main`. No Crayons Loop behavior is changed.

## Verified baseline

- Current source restricts normal upload/signing/confirmation to title states `DRAFT`, `UPLOADING`, and `PREPARING`.
- Creator/Studio scope is checked through verified server-side actor resolution and `canOperateOnTitle`.
- Internal `admin` does not receive `asset.sign_upload` or `title.ingest_internal`; do not widen those permissions. `super_admin`'s existing permissions must not be used as a replacement-approval bypass.
- Current confirmation persists the asset row, canonical poster/master key, and audit record; this must not be allowed to activate a post-submission replacement without a valid approval.
- Testing has `bridge_profiles.organization_id`, `bridge_organizations`, `bridge_organization_memberships`, asset replacement references, storage-provenance columns, `bridge_asset_versions`, `bridge_qc_cases`, and `bridge_private.upload_sessions`.
- Production lacks the organization tables/column and lacks Testing's asset replacement/provenance columns. Both projects have `bridge_asset_versions` and `bridge_qc_cases`. Neither has a dedicated replacement-approval record.
- Testing migration history currently ends with story-concept/buyer-mandate migrations on 2026-11-06. No replacement-approval migration is present.

## Non-negotiable behavior

1. A verified Creator/Studio owner or authorized active Studio member may request a replacement for one exact `title_id`, `asset_kind`, and current asset ID.
2. Only an authenticated, verified internal `admin` may approve or reject. Approval is not an upload grant and does not widen Admin permissions.
3. Approval binds the exact requester user ID, account type, organization ID (nullable for independent Creator), title, kind, old asset ID, reason, approver, expiry, and a one-use limit. A decision is immutable; rejection cannot be consumed.
4. Request and approval endpoints must reject cross-title, cross-kind, cross-user, cross-organization, inactive membership, and changed-current-asset cases.
5. The approved Creator/Studio actor uploads to a fresh immutable object key. Signing, multipart begin/commit/abort, confirmation, and final activation each re-check the same approval binding and expiry. Consumption uses a single atomic conditional update/transaction; parallel attempts cannot both win.
6. The previous verified asset remains canonical and deliverable until the replacement object is verified and activation commits. Failed, expired, aborted, checksum-mismatched, or zero-byte uploads do not change the canonical title key.
7. On activation, preserve both asset rows and version history; record old/new IDs and keys, actor, approver, reason, approval ID, checksum, and timestamp. Do not overwrite or delete the old object.
8. Replacing a QC-relevant asset invalidates the applicable QC result and blocks downstream publication/authorization until QC is re-reviewed. Do not silently reopen title submission or permit unrestricted uploads in submitted states.
9. Buyer access must continue to expose only currently authorized assets. Pending/rejected/expired replacements and internal approval metadata are never buyer-visible.
10. Existing DRAFT/UPLOADING/PREPARING uploads remain unchanged when no replacement approval is involved.

## Schema reconciliation plan

- Use a new additive migration that is safe on both current schemas; do not assume Testing-only organization or storage-provenance columns exist in Production.
- Create a non-Data-API/private approval table with restrictive grants and explicit RLS posture. Store identity bindings directly in the approval record so Production does not require the Testing-only organization-membership schema for historical approval reads.
- Add only the minimal nullable asset lineage reference(s) missing from Production, with guarded `ADD COLUMN IF NOT EXISTS`, foreign keys, and indexes. Do not retrofit unrelated storage-provenance fields as part of this feature.
- Keep approval mutation server-only. No browser INSERT/UPDATE/DELETE policy.
- Before applying the migration to Testing, compare the exact migration against both live schemas and confirm no destructive operation or unintended Data API exposure.
- Do not apply any migration to Production in this work.

## Required server enforcement

- Request: verified actor, exact current asset, ownership/Studio membership, title and kind.
- Admin decision: verified internal `admin`; no account-type/metadata fallback; no self-approval by the requester; one immutable decision.
- Sign: valid pending approval, requester binding, title/kind/current asset, unexpired and unconsumed.
- Multipart begin/commit/abort: same checks, plus session/asset/approval binding.
- Confirm: verify object size/checksum/content type; ensure new immutable key; do not activate on upload completion alone.
- Activate: atomic compare-and-swap of approval consumption and canonical asset reference; retain old asset; invalidate QC and emit audit in the same transaction.

## Automated test matrix

- Positive: Creator request; Studio owner request; active same-org Studio member request; verified Admin approval; approved requester uploads exactly one replacement; activation preserves old row/version and changes only intended canonical reference.
- Authorization: unverified Creator/Studio/Admin; viewer/QC/legal/finance role; buyer/investor; Admin upload attempt; requester self-approval; unrelated Admin role; wrong title/kind/asset/user/org; inactive or mismatched Studio membership.
- Approval lifecycle: rejected; expired; revoked; zero-use; replay; concurrent consume; approval changed after signing; old canonical asset changed before activation.
- Upload lifecycle: fresh key; signed URL expiry; multipart session mismatch; commit/abort by another actor; zero-byte; checksum mismatch; ETag mismatch; storage verification failure; duplicate confirmation.
- Failure atomicity: failure at each stage leaves old canonical key and old verified asset active; no partial approval consumption or QC state mutation.
- QC/publication: master/poster replacement invalidates QC; Buyer catalog/download remains blocked until new QC; unrelated asset-kind replacement follows its defined QC dependency; audit includes before/after lineage.
- Regression: ordinary DRAFT/UPLOADING/PREPARING upload, multipart, confirmation, signed download, Creator ownership, Studio A/B isolation, Buyer A/B isolation, publication and entitlement gates.
- Schema: migration applies on a Testing-like schema with provenance/organization tables and a Production-like schema without them; RLS/grants prevent direct anon/authenticated access.

## Execution gates

- This branch is not a deployment or release authorization.
- No Production database migration, environment change, Vercel build/deployment, main merge, QC submission, mail send, payment, or storage mutation is authorized.
- Testing DB migration application is a separate gated operation after source/migration review.
- CI/typecheck/test results must be reported individually. A green build is not certification.
