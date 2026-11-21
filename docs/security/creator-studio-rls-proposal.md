# Creator Vault and Studio RLS proposal

Status: DESIGN DRAFT — NOT EXECUTABLE; no hosted database changes authorized.
Base: `1253362e2bb19b9fbe513dd50be1e115a0dfc3c6`
Target: disposable local Supabase only; hosted Testing remains READ-ONLY.

## Identity contract

Use the repository's existing `bridge_current_user_id()` and role helper pattern, after confirming the Testing schema contains the same helper definitions and identity-link table. Do not compare `auth.uid()` directly with TEXT Bridge user IDs unless the canonical mapping explicitly resolves that identity. Never trust user-editable metadata for authorization.

## Creator documents

- Owner read/update/delete must be constrained to the canonical Bridge user ID.
- Insert must require the authenticated caller to be the resolved owner.
- Organization-owned records additionally require active membership in the exact organization and a permitted Studio role.
- No blanket authenticated policy.
- Admin review should be a separately granted operation with audit logging, not implicit owner bypass.

## Studio invites

- Invite token hashes are server-only; clients must not SELECT token hashes.
- Organization invite management requires an active authorized organization role.
- Acceptance must validate token hash, expiry, revocation/consumption state, and intended invitee identity server-side.
- Public/anon access is denied; do not expose token hashes through a broad row policy.

## Ownership transfers

- Current owner may initiate a transfer for an owned record.
- Proposed owner may accept only when authenticated identity matches the recorded proposed owner.
- Transfer must be pending, unexpired if expiry exists, and single-use.
- Completion must atomically change ownership, mark transfer completed, and write an audit event.
- Rejection/cancellation must not change ownership.

## Preconditions before executable SQL

1. Snapshot exact Testing definitions for identity helpers, all three protected tables, membership roles/status values, constraints, triggers, and grants.
2. Verify identity-link table presence and uniqueness guarantees.
3. Trace all application insert/update paths and service-role RPC callers.
4. Test policies with anon, owner, non-owner, active Studio member, inactive member, Admin, and service_role in disposable local Supabase.
5. Confirm no existing policy is replaced or weakened accidentally.

## Explicit non-actions

No Testing or Production DDL/DML, no PR merge, no main push, no Preview/Production promotion, and no broad authenticated grants.
