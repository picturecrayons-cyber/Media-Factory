# Loop TVOD schema source reconciliation — 2026-10-31

## Scope and status

Read-only source review of the Loop repository's checked-in Supabase migrations. This is source-code evidence, **not proof that these exact migrations were applied to canonical Staging or Production**. No database was queried or changed in this review.

## Best current repository contract

Source: `supabase/migrations/20260926_loop_canonical_runtime_baseline.sql` in `picturecrayons-cyber/crayons-loop-streaming-platform`.

### `public.loop_payment_events`

| Column | Declared type / constraint |
|---|---|
| id | uuid primary key, default gen_random_uuid() |
| event_id | text not null unique |
| event_name | text not null |
| razorpay_payment_id | text nullable |
| user_id | uuid nullable, FK to auth.users(id) |
| status | text not null default 'received' |
| payload | jsonb not null default '{}'::jsonb |
| received_at | timestamptz not null default now() |
| processed_at | timestamptz nullable |

The baseline enables RLS and creates a payment lookup index on `razorpay_payment_id`. A later repository migration / production history entry refers to an own-read policy; policy details must be reconciled against the exact applied migration before any repair.

### `public.loop_user_tvod_entitlements`

| Column | Declared type / constraint |
|---|---|
| id | uuid primary key, default gen_random_uuid() |
| user_id | uuid not null, FK to auth.users(id) |
| title_id | uuid not null, FK to loop_titles(id) |
| access_type | text not null, CHECK RENTAL or PURCHASE |
| purchased_at | timestamptz not null default now() |
| started_watching_at | timestamptz nullable |
| expires_at | timestamptz nullable |
| payment_transaction_id | text not null |
| status | text not null default 'ACTIVE' |

The baseline defines unique(user_id,title_id,access_type), enables RLS, and creates an own-read policy.

## Source conflicts / caveats

1. `20260914_tvod_and_content_owners.sql` creates an earlier shape: `access_type varchar(20)`, `payment_transaction_id varchar(255)`, `status varchar(20)`; `user_id` has no FK in that file.
2. `20260918_tvod_entitlements.sql` repeats the earlier TVOD table shape and adds a unique index plus RLS policy.
3. `20260916_master_production_schema.sql` defines `loop_payment_events` with the same broad columns but does not declare an FK on `user_id`; it also includes seed data and broad policy changes. **Do not replay this file.**
4. `20260926_loop_canonical_runtime_baseline.sql` is the newer repository runtime contract: `user_id` references `auth.users(id)`, fields use `text`, and the entitlement uniqueness is a table constraint.
5. `MIGRATION_HISTORY_RECONCILIATION.md` says the canonical Production project has historical migration IDs whose original SQL is not all present in this repository. It explicitly requires original SQL / canonical schema pull before reconciliation. Thus repository source alone does not prove live DB DDL.
6. The Bridge workflow's column usage and Razorpay payload keys are application/provider evidence, not independent schema evidence.

## Identity FK decision recorded for review

The approved design direction is:
`bridge_loop_identity_links.bridge_user_id text -> public.bridge_profiles(user_id text)`.

The Loop repository's `20260925220714_bridge_loop_verified_identity_links.sql` still points to legacy `public."user"(id)`. That historical migration must not be edited. A separate forward-only draft is provided alongside this report.

Before any apply: verify the existing constraint name, profile PK/unique constraint, every existing link has a matching profile, exact target project identity, and rollback plan. No identity-link rows should be inserted, updated, or deleted as part of the FK change.

## Scope A harness implications (draft recommendation only)

- Keep creating the Supabase Auth fixture in `auth.users` for `auth_user_id`.
- Stop creating a legacy `public."user"` fixture solely to satisfy `bridge_user_id`.
- Seed a matching `bridge_profiles(user_id)` fixture before inserting the identity link.
- Assert the profile FK target, auth FK target, one-to-one uniqueness, duplicate conflict rejection, orphan preflight failure, transaction rollback, and absence of invite/side-effect behavior.
- This is a test-harness change recommendation; the harness source has not been modified in this commit.

## Release posture

Draft / source reconciliation only. No SQL execution, database mutation, credential change, PR merge, deployment, or Production action. Production remains **HOLD / NOT CERTIFIED / NO-GO**.


## Canonical Staging read-only inspection — 2026-10-31

Target verified by Supabase project metadata: **Staging** project ref `jbymleftneggcgutlcqu`, name `Crayons Projects - Testing DB`, region `ap-south-1`, status `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003. This is not Production.

Read-only table catalog result:

| Object | Staging result |
|---|---|
| `public.bridge_profiles` | Present; RLS enabled; `user_id text` primary key |
| `public.bridge_loop_identity_links` | **Absent** |
| `public.loop_payment_events` | **Absent** |
| `public.loop_user_tvod_entitlements` | **Absent** |
| `public.loop_titles` | **Absent** |
| `public.bridge_payments` | Present; RLS enabled; provider-order/payment IDs and amount/status fields present |
| `public.bridge_webhook_events` | Present; RLS enabled; event ID/name/hash/status and timestamps |
| `public.bridge_entitlements` | Present; RLS enabled; Bridge-side entitlement shape |

Staging migration history returned only test-labelled Bridge baseline/security migrations through `20261030133503 testing_security_hardening_20261030`; no Loop canonical runtime baseline or TVOD migration was present in the returned migration history.

Consequences:
- The repository TVOD contract cannot be called the live Staging schema: all three Loop target tables checked above are absent.
- The identity FK forward draft cannot be applied to Staging as-is because `bridge_loop_identity_links` is absent. The `bridge_profiles.user_id` type/PK prerequisite is present.
- The Scope A harness cannot run against this Staging project; it requires a disposable PostgreSQL database with the intended baseline schema. Do not point it at Staging.
- Existing Bridge payment/webhook/entitlement tables are not interchangeable with the Loop TVOD tables. Do not infer a cross-ledger mapping or create parallel records from this catalog result.

No rows were read, no SQL was executed, and no schema/data changes were made. This inspection does not certify Production.
