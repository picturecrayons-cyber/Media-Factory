# Crayons Bridge DIT Agent — Draft Implementation

## Purpose
A Bridge-native Digital Imaging Technician (DIT) workflow for camera/media intake, integrity evidence, three-copy backup verification, QC readiness and human DIT sign-off.

## Included in this draft
- A dedicated read-only A2A agent card at `/api/a2a/agent-card?agent=dit`.
- A pure server-side DIT evidence core with SHA-256 helpers, fail-closed readiness evaluation, and human sign-off authorization policy.
- A dedicated `dit_operator` internal role with only catalog read, asset upload, DIT workspace/sign-off and audit-read permissions; it cannot QC, approve rights, license, deliver, or publish Loop.
- An authenticated, read-only `/dit` desk and role-specific navigation. The queue currently lists Bridge titles only; backup evidence and sign-off persistence are visibly marked not connected.
- Unit tests for checksum comparison, three distinct backup failure domains, byte-size parity, QC gates, RBAC and human-only sign-off.
- No new external AI provider, paid service, database, or storage bucket.

## Critical integration boundary
This draft does **not** yet connect to OCI source reads/copies, destination read-back SHA-256 verification, persistent backup/sign-off records, or DIT audit writes. The `/dit` desk is authenticated but intentionally read-only until those gates are implemented. The A2A card advertises read-only skill contracts; it is not an execution gateway. Sign-off output is a typed decision object and must not be treated as persisted approval.

## Required follow-up gates
1. Resolve the approved DIT role source and RBAC migration strategy against the Testing DB schema before any database write.
2. Implement a server-only OCI adapter that streams each source object to compute SHA-256, copies it into three independently defined failure domains, then reads back and verifies each destination. OCI ETag alone is not SHA-256 evidence.
3. Persist ingest, backup, QC and sign-off evidence with atomic audit events and idempotency. No media deletion is part of this workflow.
4. Complete authenticated server endpoints and persistent evidence/sign-off UI, with all reads and writes scoped by existing Bridge authorization.
5. Add integration tests using isolated test fixtures and OCI-compatible test doubles; no Production credentials or data.
6. Verify CI, Preview deployment SHA, app regression tests and storage evidence before any release decision.

## Database / release posture
- STAGING DB (Crayons Projects - Testing DB): READ-ONLY in this PR; no schema changes or writes. Risk: low.
- PRODUCTION DB: HOLD / NOT CERTIFIED / NO-GO; READ-ONLY only. Risk: no production mutation permitted.
- Merge, deployment, Preview promotion, production access, media deletion and delivery authorization are out of scope and require separate approval.

## Current implementation status
- DIT role and least-privilege permission matrix: implemented in branch; DB role constraint migration pending.
- Authenticated `/dit` route and role-specific navigation: implemented, read-only.
- OCI multi-destination streaming and read-back verification: NOT IMPLEMENTED.
- Persistent backup evidence, human sign-off, idempotency and audit: NOT IMPLEMENTED.
- Testing DB migration application: NOT APPROVED / NOT PERFORMED.

## Acceptance criteria for this draft
- Pure DIT integrity and authorization logic is testable without DB/storage credentials.
- Exactly three distinct backup failure domains are required; duplicate keys/domains fail closed.
- All backups must match the source byte size and SHA-256.
- QC must be passed before sign-off readiness.
- Only a verified human DIT operator or super admin can create a sign-off decision; agents cannot sign off.
