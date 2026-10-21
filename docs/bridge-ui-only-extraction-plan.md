# Bridge UI-only extraction — source boundary and release gates

Status: WORK IN PROGRESS — no merge or deployment authorized.

Base: `main` at `9c56a25e4eba2de63c4c261503112c8945b2dd5a`.
Working branch: `ui/bridge-gallery-progress-isolation-20261022`.

## Source findings

- `src/routes/title.$id.tsx` is the shared route containing both presentation and upload orchestration. It cannot be copied wholesale from PR #317 or #322 as a UI-only change.
- PR #317's upload-progress experience uses the existing `requestAssetUpload` and `confirmAssetUpload` calls, but also changes the route's upload orchestration (timeouts, cancellation guards, XHR progress, confirmation timeout) and includes storage implementation changes in `src/lib/bridge/assets.ts` and `src/lib/bridge/oci-object-storage.server.ts`.
- PR #322 is not a safe source for direct cherry-picking: it adds multipart server functions, multipart OCI operations, upload session behavior and E2E scripts, and its base is a feature branch rather than `main`.
- PR #330's Gallery changes add `requestAssetPreview`, retry-verification and download actions that depend on server/storage behavior changed in the same PR. The entire PR cannot be classified as UI-only.
- Existing `listTitleAssets` provides a potential safe data boundary for a metadata-only asset gallery, subject to confirming its current authorization and returned fields. Preview, download, retry and cleanup controls must not be added as presentation-only features.

## Extraction rules

1. Build from `main`, not from PR #317, #322, #326 or #330.
2. Extract reusable presentation components separately from server functions and OCI code.
3. Keep upload behavior on the existing single-object request/confirm contract; do not introduce multipart sessions, new migrations, storage signing changes, retry-verification actions or cleanup actions in the UI-only candidate.
4. Progress UI may display the existing request/transfer/verification phases only when those phases are accurately observable. It must not imply stored-object verification succeeded until `confirmAssetUpload` resolves.
5. Gallery must be metadata-only initially. No new preview/download/retry/cancel server capabilities, no title status or buyer-visibility changes, no rights or authorization changes.
6. Do not use real titles, AANDAAL, existing unverified assets, Production data or Production credentials for testing.
7. Before any release decision: inspect the exact diff, run CI, verify exact-SHA Preview build and runtime data isolation, obtain independent review, and require explicit Production approval. A successful build alone is not certification.

## Initial gate

- Source/dependency reconnaissance: complete.
- Actual UI extraction and integration: pending.
- CI and exact-SHA Preview: pending.
- Independent review: pending.
- Production promotion: NO-GO until every required gate passes.
