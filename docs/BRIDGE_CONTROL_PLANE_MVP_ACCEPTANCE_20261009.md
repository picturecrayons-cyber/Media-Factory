# Crayons Bridge Control-Plane MVP Acceptance Contract

Status: implementation checklist, not production certification.

## Product boundary
Bridge remains authoritative for B2B rights, QC/legal readiness, buyer access, publication authorization, and delivery evidence. Loop consumes Bridge publication grants and must not independently create rights clearance or publication authority.

## P0: Buyer access grant and revocation
- [ ] Grant is scoped to canonical title + buyer identity, with grantor, scope, timestamp, and optional expiry.
- [ ] All buyer-facing reads/downloads/screeners enforce authorization server-side.
- [ ] Unauthenticated, unverified, wrong-buyer, wrong-title, expired, and revoked requests deny by default.
- [ ] Revocation blocks new access; session/cache behavior is explicitly tested.
- [ ] E2E: grant -> access allowed -> other buyer denied -> revoke -> former buyer denied -> audit verified.

## P0: Licensing Ready gate
- [ ] Validate active rights grant, territory, language, exploitation, explicit validity window, QC for current assets, legal approval for the exact grant, and required destination package.
- [ ] Missing, expired, conflicting, or stale evidence fails closed with actionable blockers.
- [ ] LICENSING_READY remains distinct from buyer visibility, publication authorization, LICENSED, and DELIVERED.
- [ ] Loop publication only through Bridge's canonical server workflow; prohibit direct published/LIVE writes.
- [ ] E2E: eligible title passes; incomplete/expired cases fail; Loop remains unpublished without an active grant; revocation/suspension removes visibility.

## P0: Delivery evidence and audit history
- [ ] Correlate title, asset/version or checksum, destination, authorization ID, job ID, actor/service, timestamps, and outcome.
- [ ] Preserve attempts, successes, failures, and retries as distinct records.
- [ ] Storage HEAD/object metadata is not mislabeled as destination receipt; record destination acknowledgement separately when available.
- [ ] Application roles cannot update/delete prior audit events.
- [ ] E2E: authorization -> delivery attempt -> verified outcome -> audit chain, including failure/retry.

## Release gates
- [ ] Use the existing Bridge repository and canonical Supabase project; no duplicate app/database.
- [ ] Exact-head CI passes and matching Vercel Preview is READY.
- [ ] Capture Preview evidence for allow, deny, revoke, fail-closed, audit integrity, and delivery outcome.
- [ ] No production schema change, merge, or deployment until release gates pass.
- [ ] Until verified, describe capabilities as in progress, not certified or fully production-ready.
