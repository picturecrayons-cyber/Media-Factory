# Crayons STAGING Test Agent

**Status:** implementation scaffold; dry-run only.  
**Environment:** STAGING only — Supabase project `jbymleftneggcgutlcqu`.  
**PRODUCTION:** `mlmgugivsyoxzdgwkbpu` is permanently denied by this tool.

## Safety contract

- No Supabase client, SQL client, network calls, secrets, or database writes are implemented.
- Never insert directly into `auth.users`. Synthetic Auth users must be created through Supabase Dashboard or the official Auth Admin API by the owner.
- The agent accepts only synthetic Auth UUIDs supplied after owner creation.
- Live Razorpay, GitHub merge, Vercel deployment, and Production access are out of scope.
- Test records must be synthetic, tagged TEST-ONLY, and removable independently.
- A dry-run result is not a PASS for runtime security, payments, or playback.

## Run

```sh
node tools/staging-test-agent/agent.mjs --dry-run --fixtures tools/staging-test-agent/fixtures.example.json
```

Provide a private local fixture file (never commit real UUIDs) with this shape:

```json
{
  "environment": "STAGING",
  "projectId": "jbymleftneggcgutlcqu",
  "syntheticOnly": true,
  "users": [
    {"role":"A","authUserId":"00000000-0000-4000-8000-000000000001","bridgeUserId":"TEST-BRIDGE-A"},
    {"role":"B","authUserId":"00000000-0000-4000-8000-000000000002","bridgeUserId":"TEST-BRIDGE-B"},
    {"role":"C","authUserId":"00000000-0000-4000-8000-000000000003","bridgeUserId":null},
    {"role":"ADMIN","authUserId":"00000000-0000-4000-8000-000000000004","bridgeUserId":"TEST-BRIDGE-ADMIN"}
  ]
}
```

The example UUIDs are placeholders, not real accounts. Replace them locally only after owner-created test accounts exist. Do not commit that private fixture file.

## Planned verification gates

1. Schema and constraints — read-only.
2. Identity mapping uniqueness, no orphan links, verified ownership — read-only.
3. Cross-user isolation for payment events and entitlements.
4. Duplicate/replayed payment event idempotency.
5. TVOD captured-payment fulfillment exactly once.
6. Refund/access-revocation behavior against an owner-approved rule.
7. Unauthorized/unpublished title playback denial.
8. Evidence export with test ID, UTC timestamp, expected/actual, row counts, and status.

Gates 3–7 are NOT TESTED until a separately reviewed STAGING execution adapter is implemented and explicitly enabled. This scaffold only prepares and validates the test manifest.
