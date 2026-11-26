# Platform Super Admin production security review

Status: release gate in progress. This document records the production observations gathered while implementing the Platform Super Admin identity.

## Identity and authorization

- Production account: `picturecrayons@gmail.com`
- Current production profile: `account_type=studio`, `internal_role=super_admin`, verified email.
- Production Bridge↔LOOP identity link: present and verified.
- Testing profile was migrated to `account_type=platform_admin`; the `super_admin` role remains unchanged.
- Public onboarding cannot assign `platform_admin`; it is provisioned only by an authorized administrator/migration.
- Bridge server operations require a verified actor. Super Admin operations additionally require JWT `aal=aal2`.
- LOOP admin APIs require a verified Bridge identity link, matching verified email, Bridge `admin`/`super_admin` role, and AAL2 for Super Admin.

## MFA

- Production verified MFA factor count at audit time: 0.
- Testing verified MFA factor count at audit time: 0.
- Bridge now presents a TOTP enrollment/challenge gate for Super Admin.
- Bridge server actions and LOOP admin APIs fail closed unless the verified Super Admin session has AAL2.
- Production release must remain blocked until the account enrolls a TOTP factor and authenticated AAL2 verification succeeds in Preview.

## RLS advisor findings

The production Supabase security advisor reported 32 tables with RLS enabled and no policies. With RLS enabled and no applicable policy, ordinary `anon`/`authenticated` PostgREST access is denied by default; this is not a reason to add broad allow policies.

The reported tables were:

- `private.bridge_inbound_mail_events`
- `public.bridge_buyer_interest`
- `public.bridge_clearance`
- `public.bridge_creator_documents`
- `public.bridge_desk_notes`
- `public.bridge_desk_offers`
- `public.bridge_dit_copy_verifications`
- `public.bridge_dit_ingest_files`
- `public.bridge_dit_ingest_sessions`
- `public.bridge_dit_storage_objects`
- `public.bridge_enquiries`
- `public.bridge_language_rights`
- `public.bridge_license_packages`
- `public.bridge_notification_outbox`
- `public.bridge_ops_flags`
- `public.bridge_organization_memberships`
- `public.bridge_organizations`
- `public.bridge_outlet_deals`
- `public.bridge_owner_submission_events`
- `public.bridge_package_entitlements`
- `public.bridge_publishing_partners`
- `public.bridge_screener_requests`
- `public.bridge_site_content`
- `public.bridge_studio_files`
- `public.bridge_title_archive_events`
- `public.bridge_title_document_links`
- `public.bridge_title_owner_submissions`
- `public.bridge_title_seo`
- `public.bridge_title_submission_intake`
- `public.orders`
- `public.titles`
- `public.user_entitlements`

Disposition:
1. Do not add blanket policies.
2. Classify each table as service-role-only, server-function-only, or requiring an authenticated user policy.
3. Inspect every caller before changing RLS.
4. Add only least-privilege policies with tests for owner, reviewer, admin and cross-account isolation.
5. Re-run Supabase security advisors after any policy changes.

## Other production security warning

Supabase reported leaked-password protection disabled. Enable this in Supabase Auth password security settings before production release.

## Audit trail

- Bridge already has a shared `bridge_audit_logs` table and server-side audit helpers.
- LOOP featured-title presentation updates now use a service-role-only database function that updates the title and inserts the audit event atomically.
- Continue checking every remaining privileged write path for an audit event; read-only admin operations need not create mutation records.

## Release blockers

- [ ] Add the branch-scoped Testing `DATABASE_URL` to the Bridge Preview branch (copy the existing Testing secret in Vercel; do not use Production credentials).
- [ ] Complete authenticated Bridge Preview sign-in and verified Bridge↔LOOP identity linking.
- [ ] Enroll and verify Super Admin TOTP (AAL2) in Preview.
- [ ] Complete authenticated role-dashboard, ingest, cross-product and isolation E2E.
- [ ] Finish table-by-table RLS caller classification and enable leaked-password protection.
- [ ] Apply reviewed migrations to Production only after all gates pass and verify Production deployment and account profile.

No Production database, account, RLS policy, Auth setting or deployment was changed as part of this review.
