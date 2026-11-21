# LOOP TVOD Canonical Contract — 2026-11-21

## Scope and safety

This contract is based on read-only inspection of the existing Testing Supabase project `jbymleftneggcgutlcqu` on 2026-11-21 and source inspection of protected `main` plus PR #767. No SQL was applied, no records were written, and no Production project was queried or changed.

## Canonical existing database objects

| Concern | Existing object / contract |
|---|---|
| Payment event ledger | `public.loop_payment_events` |
| Entitlement source of truth | `public.loop_user_tvod_entitlements` |
| Catalog | `public.loop_titles` |
| Bridge publication authority | `public.bridge_loop_publications` |
| User identifier | UUID, FK to `auth.users(id)` |
| LOOP title identifier | TEXT, FK to `loop_titles(id)` |
| Rental access type | `RENTAL` |
| Entitlement status | `ACTIVE`, `REFUNDED`, `REVOKED`, `EXPIRED` |
| Rental expiry | exactly purchased_at + 48 hours |
| Payment event idempotency | unique `loop_payment_events.event_id` |
| Entitlement idempotency | unique `payment_transaction_id` and unique (user_id,title_id,access_type) |

Both payment and entitlement tables have RLS enabled and an explicit `deny_browser_access` policy for anon/authenticated. RPC execution grants are limited to `service_role` and postgres.

## Exact RPC signatures

- Fulfillment: `public.loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz) returns jsonb`
  - Arguments: payment ID, order ID, user UUID, title TEXT ID, purchased timestamp, expiry timestamp.
  - Requires exactly 48 hours between purchase and expiry.
  - Checks Bridge publication authorization, active distribution window, TVOD exploitation and title availability.
  - Uses `loop_payment_events` and `loop_user_tvod_entitlements`; it is already idempotent by payment ID.
- Refund: `public.loop_refund_captured_rental(text,text) returns jsonb`
  - Arguments: payment ID and refund ID.
  - Supports refund-before-capture by recording a refunded payment event; later fulfillment rejects it.
  - Revokes the entitlement associated with the payment.

The readiness function `public.loop_rental_fulfillment_ready()` checks for the existing ledger, entitlement table and exact six-argument fulfillment RPC.

## Existing Testing schema facts

- `loop_titles` uses `id TEXT`, `price_paise BIGINT`, `is_listed BOOLEAN`, `is_published BOOLEAN`, `status` values including `APPROVED` and `PUBLISHED`, and `access_tier`.
- `bridge_loop_publications` uses `loop_title_id TEXT`, `bridge_title_id TEXT`, destination `CRAYONS_LOOP`, authorization status `AUTHORIZED`, `approved_at`, revocation timestamp, territory/language/exploitation arrays, and publication windows.
- `loop_payment_events` includes unique `event_id`, `event_name`, `razorpay_payment_id`, nullable UUID `user_id`, status and JSONB payload.
- `loop_user_tvod_entitlements` uses UUID `user_id`, TEXT `title_id`, TEXT `payment_transaction_id`; no UUID cast is valid for title IDs.

## Canonical application contract

1. Keep `loop_payment_events` as the only LOOP payment-event ledger. Do not create `loop_tvod_payment_events`.
2. Keep `loop_user_tvod_entitlements` as the only TVOD entitlement authority. Never grant access during checkout/order creation.
3. Persist pending Razorpay order metadata in the existing payment event ledger's JSONB payload, keyed by a unique order event ID, and verify order ID, user UUID, title TEXT ID, amount paise and INR currency before invoking fulfillment.
4. Invoke the exact six-argument fulfillment RPC with a UUID user ID and TEXT title ID. Set expiry to purchased timestamp plus 48 hours. Do not cast title IDs to UUID.
5. Invoke the exact two-argument refund RPC. Preserve refund-before-capture behavior and payment-level idempotency.
6. Use `price_paise`; do not depend on absent `tvod_rental_price` or `bridge_loop_consumer_pricing` columns/tables.
7. Gate all catalog, checkout and playback authorization on the current Bridge publication record: destination `CRAYONS_LOOP`, authorization `AUTHORIZED`, not revoked, approved, active window, territory, language and `TVOD` exploitation.
8. LOOP product is TVOD-only. Remove SVOD/Loop Pass and direct legacy `loop_entitlements` paths from consumer purchase/playback authorization. Do not silently grant FREE/SVOD access.
9. Preserve RLS deny-browser policies and service-role-only mutation RPCs. Browser clients must not insert/update payment events or entitlements.

## PR #767 incompatibilities

The implementation branch inspected for PR #767 introduces `loop_tvod_orders` and a second `loop_tvod_payment_events` ledger, uses two-argument fulfillment and three-argument refund RPCs, assumes absent pricing/catalog fields, and casts TEXT title IDs to UUID. These do not match the existing Testing contract. Its source-text tests do not establish runtime compatibility.

## Required implementation and verification before any hosted change

- Rebase/rebuild work from current protected `main` only after reviewing the exact diff; do not merge the diverged PR #767 branch.
- Adapt checkout to persist order metadata in `loop_payment_events` without creating a second ledger or entitlement table.
- Adapt the Edge webhook to verify Razorpay capture identity, order/user/title/amount/currency and call the exact six-argument RPC; process refunds through the exact two-argument RPC.
- Adapt catalog and entitlement checks to the actual TEXT title ID and `price_paise` contract; remove SVOD and legacy entitlement authorization.
- Run formatter, typecheck, unit tests, Deno webhook tests and a disposable local PostgreSQL migration replay against the exact Testing schema snapshot.
- Verify duplicate captures, mismatched order/payment, refund-before-capture, refund-after-fulfillment, duplicate refund, revoked/expired publication, entitlement uniqueness, and service-role-only access.
- Only after all evidence passes may a separate approval be requested for hosted Testing changes. Production remains out of scope and HOLD.
