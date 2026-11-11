-- Add a dedicated DIT role without widening existing staff permissions.
-- This migration is committed to the feature branch only; it has NOT been applied
-- to STAGING DB or PRODUCTION DB.
alter table bridge_profiles
  drop constraint if exists bridge_profiles_internal_role_chk;

alter table bridge_profiles
  add constraint bridge_profiles_internal_role_chk
  check (
    internal_role is null
    or internal_role in (
      'admin',
      'super_admin',
      'qc_reviewer',
      'legal_reviewer',
      'finance',
      'viewer',
      'dit_operator'
    )
  );
