/*
Crayons Bridge — Supabase RLS review draft (NOT A MIGRATION)
Branch: audit/isolated-preview-security-integrations-20261028

SAFETY:
- Do NOT run this file in SQL Editor or apply it to any Supabase project.
- This is a review artifact, deliberately outside supabase/migrations/.
- Production remains HOLD / NOT CERTIFIED / NO-GO.
- Existing repo migration says Bridge identity is Better Auth + application RBAC,
  and explicitly warns that auth.uid() is NOT the Bridge identity source.
  Therefore, do not copy Supabase Auth auth.uid() owner policies into Bridge
  without proving the actual runtime identity model.
- Staging connector access has not been established. No database writes were made.

PART A — READ-ONLY CATALOG AUDIT (safe to run as SELECT in the intended staging project)
*/
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'bridge_production_assets','bridge_delivery_jobs','bridge_story_concept_submissions',
    'bridge_buyer_interest','bridge_clearance','bridge_desk_notes','bridge_desk_offers',
    'bridge_enquiries','bridge_ops_flags','bridge_outlet_deals','bridge_publishing_partners',
    'bridge_screener_requests','bridge_studio_files','bridge_title_seo','bridge_title_submission_intake',
    'bridge_profiles','bridge_loop_identity_links','bridge_titles','bridge_buyer_title_access'
  )
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'bridge_production_assets','bridge_delivery_jobs','bridge_story_concept_submissions',
    'bridge_buyer_interest','bridge_clearance','bridge_desk_notes','bridge_desk_offers',
    'bridge_enquiries','bridge_ops_flags','bridge_outlet_deals','bridge_publishing_partners',
    'bridge_screener_requests','bridge_studio_files','bridge_title_seo','bridge_title_submission_intake'
  )
order by tablename, policyname;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'bridge_production_assets','bridge_delivery_jobs','bridge_story_concept_submissions',
    'bridge_buyer_interest','bridge_clearance','bridge_desk_notes','bridge_desk_offers',
    'bridge_enquiries','bridge_ops_flags','bridge_outlet_deals','bridge_publishing_partners',
    'bridge_screener_requests','bridge_studio_files','bridge_title_seo','bridge_title_submission_intake'
  )
order by table_name, grantee, privilege_type;

/*
PART B — REQUIRED AUTHORIZATION MODEL (design only; do not execute yet)

Observed from repository:
- Bridge application identity is Better Auth + src/lib/bridge/rbac.ts.
- InternalRole values are admin, super_admin, qc_reviewer, legal_reviewer,
  finance, viewer. There is no internal_admin role.
- bridge_titles.owner_user_id and bridge_loop_identity_links exist in inspected
  schema evidence; do not assume their types/joins are interchangeable.
- bridge_buyer_title_access has title_id, buyer_user_id, granted_by, granted_at,
  expires_at, revoked_at; verify the real relationship and revocation semantics.

Before writing executable policies, choose and prove ONE architecture:
A) all data access is via trusted server-side DATABASE_URL/connection with Better
   Auth + RBAC checks; browser roles have no direct table grants; or
B) browser Supabase Auth is a supported identity source and every RLS predicate
   can safely map auth.uid() to Bridge user IDs.

The existing migration favors A. If A is confirmed, do not invent user-specific
RLS predicates that rely on auth.uid(); remove direct client grants and ensure
server access uses a narrowly controlled DB role. Note: service_role bypasses RLS
and must never reach browser code.

PART C — PROPOSED POLICY REMEDIATION (INTENTIONALLY COMMENTED OUT)

First, inspect exact current policy names and dependent application flows. Then,
in a separate reviewed migration, drop only confirmed overbroad policies:
  -- DROP POLICY IF EXISTS "Allow authenticated access to studio production assets"
  --   ON public.bridge_production_assets;
  -- DROP POLICY IF EXISTS "Allow authenticated admin operations on delivery jobs"
  --   ON public.bridge_delivery_jobs;
  -- DROP POLICY IF EXISTS "Allow authenticated server-side access"
  --   ON public.bridge_story_concept_submissions;

These names were reported by a prior read-only audit; re-confirm them in staging
before any DROP. Do not assume dropping these policies alone implements the final
authorization model.

For the 12 server-only tables, inspect all grants, views, RPCs, triggers, and
security-definer functions before proposing REVOKE statements. A safe candidate
pattern, ONLY after confirming table existence and runtime server-role needs:
  -- REVOKE ALL PRIVILEGES ON TABLE public.bridge_buyer_interest,
  --   public.bridge_clearance, public.bridge_desk_notes, public.bridge_desk_offers,
  --   public.bridge_enquiries, public.bridge_ops_flags, public.bridge_outlet_deals,
  --   public.bridge_publishing_partners, public.bridge_screener_requests,
  --   public.bridge_studio_files, public.bridge_title_seo,
  --   public.bridge_title_submission_intake FROM anon, authenticated;
Do not add broad grants to service_role without confirming current grants and
the trusted server connection path.

PART D — ACCEPTANCE TEST MATRIX (must run against isolated staging, not Production)
- anon: no access to protected rows or writes.
- unrelated authenticated identity: denied.
- owner: only own production assets/submissions; cannot change owner/title binding.
- assigned vendor: only assigned delivery jobs; only approved fields/transitions;
  cannot delete or reassign the job.
- buyer without valid active title grant/shortlist: denied.
- buyer with valid active grant: SELECT only for authorized title rows.
- admin: permitted operational actions only.
- super_admin: follow explicit role matrix; do not infer write access solely from name.
- all 12 server-only tables: anon/authenticated SELECT/INSERT/UPDATE/DELETE denied.
- trusted server flows: regression-tested through the existing Better Auth + RBAC path.
- check policy composition: permissive policies OR together; any USING (true) policy
  can defeat restrictive intent. Verify both USING and WITH CHECK for UPDATE.

Do not mark PASS until actual staging tests and exact-SHA evidence are attached.
*/
