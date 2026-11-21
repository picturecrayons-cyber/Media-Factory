# LOOP TVOD entitlement RPC security review — 2026-11-21

## Scope and safety

- **STAGING / Testing DB:** Supabase project `jbymleftneggcgutlcqu`.
- **Action:** READ-ONLY inspection of the function definition, ownership, search_path, and effective EXECUTE grants.
- **Access:** STAGING READ-ONLY; repository audit documentation WRITE only.
- **Risk:** no function, grant, schema, or data changes.
- **PRODUCTION DB:** `mlmgugivsyoxzdgwkbpu` remains **HOLD / NOT CERTIFIED / NO-GO**.

## Observed function

Signature: `public.has_active_loop_tvod_entitlement(text)`

- Language: SQL
- Volatility: STABLE
- SECURITY DEFINER: true
- Owner: postgres
- Configured search_path: `public, auth, pg_temp`
- EXECUTE: anon = false; authenticated = true; service_role = true.

Function body observed:

```sql
select exists (
  select 1
  from public.loop_user_tvod_entitlements e
  where e.user_id = auth.uid()
    and e.title_id = p_title_id
    and e.access_type = 'RENTAL'
    and e.status = 'ACTIVE'
    and e.expires_at is not null
    and e.expires_at > now()
);
```

## Assessment

**Intent appears legitimate:** this is a user-scoped playback entitlement predicate. It accepts a title ID and checks only the entitlement belonging to the current `auth.uid()`, with a rental-only, ACTIVE, non-null, unexpired condition. The table is otherwise server-controlled, so SECURITY DEFINER may be the deliberate way to evaluate entitlement without granting browser roles direct table access.

**Positive controls observed:**
- Table name is schema-qualified as `public.loop_user_tvod_entitlements`.
- Identity function is schema-qualified as `auth.uid()`.
- No dynamic SQL or caller-supplied SQL fragment.
- Caller cannot supply a user ID; row scope is bound to the authenticated JWT identity.
- anon has no EXECUTE grant.
- Function returns only boolean, not entitlement row details.

**Hardening opportunity:** the configured search_path includes writable schema `public` and `pg_temp`. Although the observed body schema-qualifies its relation and identity function and contains no dynamic SQL, the safer least-privilege configuration is `pg_catalog` only (with explicit schema qualification for every non-catalog object). This is a recommendation, not a change made here.

**Behavioral checks still required:** execute under two disposable authenticated JWT identities with seeded, isolated entitlements; prove user A receives true only for A's own active, unexpired rental; false for B's entitlement, expired/refunded/revoked/purchase states, and unknown title; prove anon cannot execute. Also test that no caller can use this RPC to infer another user's entitlement.

## Decision

- Static function-body review: **PASS WITH HARDENING RECOMMENDATION**.
- Authenticated user isolation: **NOT VERIFIED** (no two-user behavioral test yet).
- Anon execution denial: **PASS** (catalog effective privilege).
- Search-path hardening: **RECOMMENDED / NOT IMPLEMENTED**.
- Hosted Testing change: **NONE**.
- Production: **HOLD / NOT CERTIFIED / NO-GO**.

Do not revoke authenticated EXECUTE blindly: Loop playback may depend on this predicate. Do not alter the function until caller-path and local behavioral tests are complete and a separate implementation gate is approved.
