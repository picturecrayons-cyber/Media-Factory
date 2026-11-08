# Crayons Bridge Story Concept Workflow — Corrective Draft Report

**Posture:** PRODUCTION HOLD / NOT CERTIFIED / NO-GO  
**Base:** `main` / production deployment commit `c7c9c81af1d305a9521861d9f5e4e63bf4d10a82`  
**Branch:** `fix/story-concept-workflow-separation-20261106`

## Verified root cause

1. `MyStoryConcepts` linked concept submissions to `/title/$id` using the linked title ID.
2. `StoryConceptForm` navigated to the same Film workspace after submission.
3. `listTitles` / owner catalog SQL did not filter `submission_type = 'story_concept'`.
4. Story Concept create operations inserted the title, title event, concept row and audit event as separate writes.
5. Authenticated server functions used GET while sending the Supabase bearer token through TanStack Start `sendContext`; GET is unsafe for this context because query transport may serialize it into the URL.

## Production read-only evidence

The two reported title IDs both resolve to `submission_type='story_concept'` and each has one corresponding `bridge_story_concept_submissions` row with `curation_status='PENDING'`. One title is `DRAFT`; the other is `UPLOADING`. No production row was changed.

## Draft implementation

- Two distinct Studio product CTAs and routes.
- Dedicated Story Concept listing, create route and concept workspace.
- Finished Film queries and generic title loading exclude Story Concept records.
- Concept submission routes by concept submission UUID, not title ID.
- Story Concept creation is transactional; audit write uses the same transaction.
- Idempotency key and reviewer / fee certification fields are added by an additive migration.
- Curation state values are normalized to `PENDING_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `BUYER_EVALUATION_APPROVED`.
- Curation mutation is admin/super-admin only; buyer evaluation approval is blocked unless `fee_certified_at` exists.
- Authenticated server functions are switched from GET to POST to prevent bearer context being sent through GET URL query transport.
- Concept detail route does not call film asset, multipart upload or QC APIs.

## Not certified / follow-up blockers

- The migration is a draft and has **not** been applied to any database.
- Buyer / investor evaluation listing, secure material delivery, tenant isolation and immediate access revocation require end-to-end implementation and staging verification before the evaluation approval status can be used operationally.
- The 12 requested integration scenarios require isolated Preview DB and authenticated test actors; they are not proven by static tests.
- No local build/typecheck/test output is claimed in this report.
- No Vercel deployment, production database mutation, production env change, payment, email or OCI operation was performed.

## Protected scope

No Finished Film rows, asset rows, multipart upload sessions or storage objects are intentionally modified. The film upload implementation itself is not changed. The additive migration targets only `bridge_story_concept_submissions`. Jananam 1947, Pranayam 1947, Sevagramam, test 1 and Test must be included in the non-production regression run before certification.

## Acceptance matrix

| Requirement | Draft status |
|---|---|
| Separate Studio CTAs | Implemented in source; test pending |
| Dedicated Concept routes | Implemented in source; build pending |
| Film list excludes concepts | Implemented in SQL; test pending |
| Concept workspace has no film ingest UI | Implemented in source; test pending |
| Atomic creation + idempotency | Implemented in source; migration pending |
| Admin-only review + fee gate | Implemented in source; staging verification pending |
| Buyer/investor isolation and secure downloads | BLOCKED / NOT COMPLETE |
| Production database / deployment untouched | Confirmed by actions taken |
| Full 12-scenario integration suite | NOT RUN |
