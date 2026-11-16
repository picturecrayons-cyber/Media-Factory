-- Explicitly map the single verified legacy Studio profile for StreamVista.
-- This is not a name-based bulk backfill: exact account type, verified email,
-- no internal role, one matching profile and unmapped state are all required.
-- Existing title ownership rows are not modified.
do $$
declare
  v_user_id text;
  v_org_name text;
  v_org_id uuid;
  v_match_count integer;
begin
  select count(*) into v_match_count
  from public.bridge_profiles
  where account_type = 'studio'
    and upper(trim(organization_name)) = 'STREAMVISTA OPC PVT LTD';

  if v_match_count <> 1 then
    raise exception 'Expected exactly one StreamVista Studio profile; found %', v_match_count;
  end if;

  select user_id, organization_name
    into v_user_id, v_org_name
  from public.bridge_profiles
  where account_type = 'studio'
    and upper(trim(organization_name)) = 'STREAMVISTA OPC PVT LTD'
    and email_verified = true
    and internal_role is null
    and organization_id is null
  for update;

  if v_user_id is null then
    raise exception 'StreamVista Studio profile is not verified, is privileged, or is already mapped';
  end if;

  insert into public.bridge_organizations (legal_name, normalized_name, status)
  values (
    v_org_name,
    lower(regexp_replace(trim(v_org_name), '[[:space:]]+', ' ', 'g')) || ':' || v_user_id,
    'active'
  )
  returning id into v_org_id;

  update public.bridge_profiles
  set organization_id = v_org_id,
      updated_at = now()
  where user_id = v_user_id
    and organization_id is null;

  if not found then
    raise exception 'Studio profile organization mapping did not update exactly one row';
  end if;

  insert into public.bridge_organization_memberships
    (organization_id, user_id, membership_role, status, created_by)
  values (v_org_id, v_user_id, 'owner', 'active', v_user_id);
end $$;
