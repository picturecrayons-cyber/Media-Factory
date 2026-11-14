# Bridge delivery jobs — ACL follow-up gate

Date: 2026-11-14
Branch: `security/bridge-delivery-jobs-client-grants-review`
Status: documentation-only review; no SQL executed.

## Environment boundary

| Environment | Project | Action | Access | Risk |
|---|---|---|---|---|
| PRODUCTION DB | `mlmgugivsyoxzdgwkbpu` | ACL/catalog/default-ACL inspection | READ-ONLY | High |
| STAGING / Testing DB | `jbymleftneggcgutlcqu` | migration/schema inventory | READ-ONLY | Medium |
| GitHub | `picturecrayons-cyber/Media-Factory` | source review and proposal documentation | READ / documentation WRITE on this branch only | Low |
| Vercel | `bridge`, `crayonsloop` | branch env metadata and deployment lookup | READ-ONLY | Medium |
| Hostinger Mail | connected mailbox | message search only | READ-ONLY | Low |

No Supabase DDL/DML, grants, migration, row writes, Vercel env edit, deployment, PR merge, Production promotion, email dispatch, or spend occurred.

## 1. Canonical schema source — NOT VERIFIED

At Production main SHA `16d370ebe455045255868c556604a874cd1910af`, all tracked SQL files under `migrations/` and `supabase/migrations/` were inspected for `bridge_delivery_jobs`.

Findings:
- No tracked `CREATE TABLE bridge_delivery_jobs` statement was found.
- The only tracked migration reference is `supabase/migrations/20261114170000_bridge_delivery_job_ownership.sql`. It performs `ALTER TABLE`, adding `requested_by text`, `request_note text`, and an index on `(requested_by, created_at desc)`.
- The canonical origin/initial DDL of the Production table is therefore NOT VERIFIED from the tracked migration history. Do not infer that it was manually created; the provenance is simply missing from the reviewed repository history.
- The live Production catalog is currently the only inspected schema source.

Production catalog schema:
- `id uuid primary key`
- `title_id text NOT NULL`, FK to `bridge_titles(id)` with `ON DELETE CASCADE`
- `job_type text`, check values: `dubbing, loudness, imf, dcp, human_qc, localization`
- `status text`, check values: `requested, in_progress, completed, failed, approved`
- `assigned_vendor text`
- `delivery_receipt_url text`
- `admin_sign_off boolean`
- `requested_by text`
- `request_note text`
- `created_at timestamptz`, `updated_at timestamptz`
- indexes: PK, `requested_by_idx`, `status_idx`, `title_id_idx`
- RLS enabled, FORCE RLS false
- policy `bridge_delivery_jobs_internal_only`: PERMISSIVE, `authenticated`, command ALL, USING and WITH CHECK both call `private.bridge_is_internal()`
- no user triggers or dependent views were returned by the catalog inspection; no column-level ACL entries were returned.
- `service_role` retains its existing table ACL in the current snapshot.

Relevant code:
- `src/lib/bridge/delivery-jobs.ts` is server-only through TanStack server functions and `authMiddleware`, calls `requireVerifiedActor`, checks Bridge RBAC/title access, then uses `getSql()`.
- Read paths include internal admin list and non-internal requester/title-owner/studio-membership scoping.
- Write paths include request, assign, complete, approve with status transition guards and audit events.
- `src/lib/db.ts` calls `resolveBridgeDatabaseUrl()`, then creates a node-postgres Pool for the PostgreSQL path.
- `src/lib/bridge/database-binding.ts` accepts `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL`, `SUPABASE_DATABASE_URL`; Preview requires `VERCEL_ENV=preview`, `BRIDGE_DATABASE_TARGET=staging`, and host/pooler username matching the configured STAGING Supabase ref.
- `scripts/migrate.mjs` uses the same connection variable family for migrations.

The Supabase connector's Production SQL session returned `current_user=session_user=postgres`. This is the connector session identity only; it does NOT establish the Vercel Preview runtime role.

## 2. Preview runtime DB role — BLOCKED

Branch-scoped Vercel env metadata was inspected without decryption:

- Bridge PR #599 branch: Supabase URL aliases, publishable key, `BRIDGE_DATABASE_TARGET=staging`; no `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL`, or `SUPABASE_DATABASE_URL` entry returned.
- Bridge PR #590 branch: Supabase URL/key aliases, `BRIDGE_DATABASE_TARGET=staging`, Preview markers; no accepted PostgreSQL connection binding returned.
- Loop PR #207 branch env inventory returned empty.
- PR #207 exact-head CI run #1061 completed successfully. Exact-head Preview deployment is still absent in the previously checked deployment inventory.

Therefore no Preview runtime connection was available to query `current_user/session_user/rolbypassrls`. Runtime role remains NOT VERIFIED. No secrets were decrypted or changed, and no deployment was triggered.

## 3. Production ACL and default ACL evidence

Production `public.bridge_delivery_jobs` raw ACL:
```
postgres=arwdDxtm/postgres
anon=arwdDxtm/postgres
authenticated=arwdDxtm/postgres
service_role=arwdDxtm/postgres
```

For PostgreSQL 17, `arwdDxtm` includes:
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`.

The prior proposal's rollback omitted `MAINTAIN`; this has been corrected in the updated proposal. No direct PUBLIC entry was present in the captured raw ACL.

Owner-specific default ACL audit found client-role defaults:
- owner `postgres`, schema `public`: table privileges (all eight listed above) and function EXECUTE defaults for anon/authenticated; sequence SELECT/USAGE/UPDATE defaults.
- owner `postgres`, schema `storage`: corresponding table/function/sequence defaults.
- owner `supabase_admin`, schemas `public`, `graphql`, `graphql_public`: corresponding table/function/sequence defaults.
- No grant-option entries were reported for these rows.

These are future-object defaults, not proof that each current table is granted identically. They are not modified by the table-specific proposal. Do not apply broad `ALTER DEFAULT PRIVILEGES` changes without reviewing object-owner creation paths and API dependencies. In particular, do not alter Supabase-managed `supabase_admin` defaults or GraphQL/Storage schemas under this narrow gate.

Role membership output included PostgREST's `authenticator` membership in `anon`, `authenticated`, and `service_role`; membership inheritance must be included in effective-privilege testing. The connector's `postgres` membership output must not be confused with the application connection.

## 4. Updated proposal

Updated file:
`docs/security-drafts/bridge_delivery_jobs_acl_correction.proposal.sql`

Changes:
- accurate raw ACL and PostgreSQL 17 `MAINTAIN` privilege captured;
- preflight includes table owner, raw ACL, RLS/FORCE RLS, effective privileges for all eight privilege types;
- role membership and owner-specific default ACL inventory queries added;
- postflight checks all eight privilege types;
- rollback restores all eight observed grants, including `MAINTAIN`;
- explicitly excludes default-privilege changes from the narrow table correction;
- adds runtime binding and missing canonical DDL blockers.

Still a proposal only. It is not in `supabase/migrations/` and has not been executed.

## 5. Synthetic identity STAGING test design — PREPARED, NOT RUN

STAGING currently has no `public.bridge_delivery_jobs`; do not create it for this gate. The current STAGING schema also has `bridge_titles.id text`, and the Production table's FK targets `bridge_titles(id)` text. This compatibility is promising but does not establish a complete table DDL source or parity.

After the canonical DDL is recovered and a separate STAGING WRITE approval is granted, use synthetic-only fixtures in a disposable schema/database or approved isolated STAGING fixture:

| Synthetic identity / caller | Test | Expected |
|---|---|---|
| Anonymous / PostgREST anon | SELECT + INSERT/UPDATE/DELETE/TRUNCATE attempts | Denied |
| Authenticated unrelated user A | Direct table API access | Denied |
| Better Auth requester A | App list/create for own authorized title | Own/requested rows only; create follows RBAC |
| Better Auth requester B | Attempt read/delete of A's job | Denied |
| Title owner A | List jobs tied to owned title | Allowed only within server route scope |
| Studio member A in org X | Read title/job in org X | Allowed only if active membership and title scope pass |
| Studio member B in org Y | Read org X job | Denied |
| Internal admin synthetic user | List operational jobs | Allowed only via verified internal role |
| Unverified/development identity | All delivery endpoints | Denied |
| Trusted Preview DB runtime role | Server route read/write transitions | Only required route operations; role is non-superuser and no accidental browser exposure |
| `service_role` / PostgREST | Direct API access | No new grants; test separately because existing service_role ACL is intentionally preserved |

Route transition tests:
- request: only authorized title and supported job type; status starts `requested`;
- assign: only `requested -> in_progress`, authorized delivery permission;
- complete: only `in_progress -> completed`, HTTPS receipt required;
- approve: only `completed -> approved`, receipt present and publish permission;
- negative tests: cross-user, cross-organization, wrong state, invalid receipt, missing permission, dev/unverified user;
- audit event is emitted for each successful state change.
- No real titles, customer records, payment data, live email, rights approvals, publication, or OCI object changes.

Acceptance also requires proving that browser roles have no direct table privileges, while server-only route flows remain functional. RLS policy must remain unchanged during the ACL-only test. Rollback must be exercised only in an isolated disposable database, never against Production.

## 6. Mail evidence

Hostinger mailbox is connected and read-only message search ran for exact `bridge_delivery_jobs`; no matching messages were returned. A search for generic database-connection messages found Supabase status notifications, not a verified Bridge runtime connection string or role record. No email was sent or modified.

## 7. Gate result

| Gate | Status |
|---|---|
| Production live table schema snapshot | PASS — READ-ONLY |
| Canonical CREATE TABLE migration/source | NOT VERIFIED |
| Server-side call path and app RBAC | PASS — CODE REVIEW |
| Preview runtime DB role | BLOCKED |
| Production raw ACL snapshot | PASS — READ-ONLY |
| Owner/schema-specific default ACL inventory | PASS — READ-ONLY |
| Corrected rollback proposal | PREPARED — NOT EXECUTED |
| STAGING table for ACL test | BLOCKED — absent |
| Synthetic identity test plan | PREPARED — NOT RUN |
| Production correction | NOT AUTHORIZED |

**PRODUCTION HOLD / NOT CERTIFIED / NO-GO.**
**App-inu pani kittaruthu.**
