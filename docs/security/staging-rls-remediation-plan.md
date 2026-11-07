# Staging-only Supabase security remediation plan

Status: **DRAFT / NOT CERTIFIED**  
Target: `crayons-bridge-staging` (`bbtrosuwisnxacuxvegt`, ap-south-1, PostgreSQL 17)  
Explicit exclusions: Production project `mlmgugivsyoxzdgwkbpu`; no production queries, migrations, Auth changes, data edits, title changes, or upload retries.

## Baseline evidence (2026-10-23)

- Supabase Security Advisor reports 63 `rls_enabled_no_policy` findings.
- It reports `public.loop_my_watchlist()` as a SECURITY DEFINER function executable by `authenticated`.
- It reports Auth leaked-password protection disabled.
- Catalog inspection found 78 public tables and confirmed the 63-table list in the advisor.
- The existing `loop_my_watchlist()` function is owned by `postgres`, has `search_path=public, pg_temp`, and has EXECUTE grants to `authenticated` and `service_role`. This is not proof that its callers or all downstream authorization checks are safe.
- Current related policies found include own-row SELECT/INSERT/DELETE policies on `loop_watchlists` and a SELECT policy on `bridge_loop_publications`. The advisor's no-policy finding names the distinct table `loop_watchlist` (singular); do not assume these are interchangeable.
- GitHub repository search did not establish the application caller for `loop_my_watchlist()`. Caller discovery remains an open item.

## Safety rules

1. Keep all investigation read-only until a table's owner, intended callers, data sensitivity, row ownership, organization relationship, and required operations are documented.
2. Never apply one generic `auth.uid() = user_id` policy across the 63 tables.
3. Do not expose internal tables (migration history, tokens, webhook payloads, mail outbox, payment/order records, entitlements, rights/deals, audit trails, secrets) to `anon` or `authenticated` without a documented use case and least-privilege policy.
4. Any proposed SQL migration must be reviewed, version-controlled, and tested against Staging only. Use synthetic test users/data, not production titles or buyer records.
5. No production promotion, merge, real-title upload retry, or changes to buyer visibility as part of this work.

## Table-by-table classification register

For every finding, record: (a) columns and primary key, (b) foreign keys, (c) grants, (d) current policies, (e) application call sites, (f) data sensitivity, (g) owner/org relationship, (h) intended operations, (i) negative tests, and (j) classification.

Initial triage classes (provisional only; **not policy authorization**):

- **Internal/service-only pending confirmation:** `_migrations`, `account`, `session`, `verification`, `bridge_email_challenges`, `bridge_mail_outbox`, `bridge_mail_webhook_events`, `bridge_webhook_events`, `bridge_title_merge_audits`, `bridge_loop_analytics_events`, `streamvista_orders`, `streamvista_jobs`, `loc_jobs`, `qc_jobs`, `transfers`, `revenue_events`, `screeners`, `config_revisions`.
- **Rights, licensing, entitlement, distribution or buyer-access sensitive; likely admin/service/organization scoped:** `bridge_buyer_prospects`, `bridge_buyer_title_access`, `bridge_deal_entitlements`, `bridge_distribution_deliveries`, `bridge_distribution_partners`, `bridge_dmca_registrations`, `bridge_language_rights`, `bridge_license_deals`, `bridge_license_packages`, `bridge_loop_identity_links`, `bridge_package_entitlements`, `bridge_title_gate_certifications`, `bridge_title_merge_aliases`, `bridge_titles`, `loop_entitlements`, `loop_subscriptions`, `subscriptions`, `entitlements`, `territories`, `streamvista_legacy_links`.
- **Communications, profiles, workflow or service operations; classify using real ownership and call sites:** `bridge_communication_messages`, `bridge_communication_threads`, `bridge_invites`, `bridge_notifications`, `bridge_profiles`, `bridge_service_catalog`, `bridge_service_costs`, `bridge_service_invoices`, `bridge_service_order_events`, `bridge_service_orders`, `bridge_service_quote_lines`, `bridge_service_quotes`, `bridge_service_rates`, `bridge_site_content`, `bridge_tax_rates`, `loop_profiles`, `loop_titles`, `loop_watch_progress`, `loop_watchlist`, `profiles`, `submissions`, `titles`, `user`, `watchlist`.
- **Configuration or public-read candidate only after field review:** `platform_meta`. Public-read is not approved merely because a table appears to contain metadata.
- **Unclassified pending schema/call-site confirmation:** any finding not mapped above, and all listed tables until the evidence register is completed.

This is an initial triage to prioritize review. It must not be treated as a final access policy. Reconcile the provisional list against the current 63-row advisor output before any migration.

## Required validation matrix

For each table and operation that is granted:
- Anonymous caller: denied unless explicitly approved public read.
- Authenticated owner: only allowed rows/operations.
- Authenticated non-owner: cannot read, insert, update, delete or reassign another user's row.
- Same-organization member: only allowed if active membership and role permit it.
- Different-organization member: denied.
- Unprivileged authenticated user: denied admin-only and internal data.
- Service role: only server-side workflows that need the operation; never expose its key client-side.
- UPDATE checks must include both `USING` and `WITH CHECK` where relevant.
- Rights, publication authorization, title status, territory/window, buyer entitlement and payment state must be independently enforced where applicable.

## `loop_my_watchlist()` decision gate

1. Find the real application RPC caller(s) and document expected response shape and authorization behavior.
2. Inspect the function body, all referenced relations, grants, RLS policies, and any nested functions.
3. Prepare a Staging-only `SECURITY INVOKER` candidate in a migration branch; do not apply until dependencies and expected behavior are known.
4. Test owner, second user, anonymous, unauthenticated request, and unauthorized role. Confirm only the caller's watchlist is returned and only currently authorized/published titles appear.
5. If INVOKER fails, fix missing least-privilege grants/policies first. A narrowly scoped DEFINER exception requires a written justification, hardened search_path, explicit identity checks, minimal EXECUTE grants, and a fresh advisor run.

## Leaked-password protection

Enable only in Staging through the Supabase Auth dashboard after confirming the correct project. Then test signup, password update and reset with synthetic accounts, including known-compromised and acceptable passwords. Record any changed user-facing error behavior. Do not claim enabled until dashboard state and tests are captured.

## Exit criteria

- All 63 findings mapped to reviewed, approved policies or explicitly documented as intentionally inaccessible/internal.
- No broad grants or policies added merely to clear the advisor.
- Exact migration SHA, Staging project reference, execution output, test matrix and post-change advisor output recorded.
- `loop_my_watchlist()` caller and least-privilege behavior verified.
- Leaked-password protection setting and auth flow tests evidenced.
- Independent security review completed.

Until then: **NO-GO — NOT CERTIFIED**.
