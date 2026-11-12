# Crayons Bridge — Automated Technical QC

## Purpose

Add an internal-only software technical-QC capability to the existing Bridge asset workflow. It is separate from human artistic curation, legal/rights review, and publication authorization.

## Current implementation milestone

The first code milestone adds a deterministic evaluator for trusted `ffprobe` metadata. It evaluates duration, video presence, dimensions, codec allowlists, frame rate, audio presence/codec, container metadata, and multiple programme streams. It emits a versioned report with findings and explicit limitations.

The evaluator is not yet connected to upload confirmation, storage reads, lifecycle transitions, the QC reviewer UI, or a background worker. It must not be used to mark a title QC-passed.

## Required production architecture

1. Bind a job to an immutable, storage-verified `bridge_assets` version and record its exact asset ID/key/version.
2. Dispatch an internal job to an isolated worker. Do not run FFmpeg on a Vercel request/serverless function.
3. Worker downloads only the exact sealed object using short-lived, server-side credentials; enforce size, duration, CPU, memory and wall-clock limits.
4. Run pinned FFmpeg/ffprobe binaries and deterministic checks. Never accept client-supplied probe JSON as trusted evidence.
5. Persist the versioned report and tool/policy versions against the exact asset version; write an audit event.
6. Display technical findings to authorized internal QC reviewers only. Human reviewers retain the ability to accept, reject or request changes.
7. Keep technical QC status separate from Bridge title lifecycle and from artistic/legal/rights/publication decisions.

## Planned check families

- Probe metadata: container, streams, codecs, resolution, aspect ratio, frame rate, duration, audio channels/sample rate.
- Picture: decode errors, black frames, freeze frames and corruption.
- Audio: stream mapping, clipping, loudness, silence and A/V sync.
- Subtitles: format, encoding, language metadata, timing and synchronization.
- Integrity: SHA-256 over the exact verified object; report immutable asset identity and byte size.

## Safety and acceptance gates

- No production database migrations or writes in this milestone.
- No changes to RLS, grants, storage policies, OCI permissions, environment variables, Razorpay, LOOP publication, or production deployment.
- Technical PASS must never automatically imply artistic/legal approval or change title lifecycle.
- Missing worker/storage/report-persistence evidence means NOT TESTED / BLOCKED, never PASS.
- Add a dedicated disposable test suite and verify exact-head GitHub CI before considering a Preview.
- Preview must use non-production fixture media and isolated credentials. No production film upload/download test is authorized by this work.

## Remaining blockers

- Select and approve an existing non-production worker/runtime; no worker service is currently evidenced by this source audit.
- Verify safe access to sealed OCI objects and establish strict resource/time limits.
- Decide policy profiles per festival/delivery specification rather than hardcoding one universal standard.
- Design report persistence and internal-only RBAC/UI integration only after existing migration history and staging compatibility are audited.
