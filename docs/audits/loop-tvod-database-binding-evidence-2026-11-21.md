# LOOP TVOD database binding evidence — 2026-11-21

Read-only follow-up to the implementation gate. No values were decrypted and no configuration was changed.

## Vercel Bridge project

- Project: `bridge` (project ID `prj_fT7VTrZMcgP9NutDhPvMhDAPtXNo`).
- Existing Vercel project reports latest deployment READY; this is not proof of the new isolated branch's runtime.
- Branch-scoped Preview variables for `implementation/bridge-end-to-end-20261121`: exactly five returned:
  - `SUPABASE_URL`
  - `VITE_SUPABASE_URL`
  - `VITE_BRIDGE_EXPECTED_SUPABASE_REF`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `BRIDGE_DATABASE_TARGET`
- Their comments and non-secret URL/ref metadata identify the existing Testing Supabase project `jbymleftneggcgutlcqu`; `BRIDGE_DATABASE_TARGET` is configured as `staging`.
- No `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL`, or `SUPABASE_DATABASE_URL` appeared in that branch-scoped five-variable result.
- The isolated branch `fix/loop-tvod-contract-20261121` has no branch-scoped Preview variables returned.
- The project-wide environment listing is truncated (only 101 entries returned, more omitted), so absence of a database URL from shared Preview variables is NOT established. No secret values were requested or decrypted.

## Supabase Edge Function inventory

Read-only function inventories:
- Testing project `jbymleftneggcgutlcqu`: only `loop-public-catalog`, ACTIVE, version 3. No `razorpay-webhook` function is listed.
- Production project `mlmgugivsyoxzdgwkbpu`: `razorpay-webhook`, ACTIVE, version 16; `loop-public-catalog`, ACTIVE, version 1.

This establishes that the connected Testing project currently has no deployed `razorpay-webhook` Edge Function. It does not establish the actual runtime environment-variable values of the Production webhook, nor whether a Vercel server database binding is injected through a shared Preview variable.

## Updated gate

| Gate | Status |
|---|---|
| Branch-specific implementation Preview Supabase URL/ref | PASS — points to Testing project |
| Branch-specific `BRIDGE_DATABASE_TARGET` | PASS — `staging` |
| Branch-specific Postgres URL alias | NOT PRESENT in returned branch-scoped set |
| Shared Preview Postgres URL alias | NOT VERIFIED — project-wide listing truncated |
| Testing webhook deployment | FAIL — function absent from Testing inventory |
| App server DB target parity with Edge Function | BLOCKED |
| Source code patch / replay / tests | NOT RUN |
| Hosted Testing writes / Production changes | NOT RUN |

## Conclusion

The previous BLOCKED decision remains. A source patch that adds checkout writes through `getSql()` and fulfillment through an Edge Function cannot be certified until the effective Vercel Preview Postgres binding is identified without exposing its secret value and a Testing webhook deployment target is explicitly established. Do not infer or copy Production webhook configuration. Do not deploy a function, create variables, or mutate either hosted database under this audit approval.
