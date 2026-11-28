-- Introduce a distinct platform-level account classification for the existing Super Admin.
-- The privileged capability remains governed by internal_role and verified identity;
-- account_type alone never grants administrative permissions.
begin;

alter table public.bridge_profiles
  drop constraint if exists bridge_profiles_account_type_chk;

alter table public.bridge_profiles
  add constraint bridge_profiles_account_type_chk
  check (account_type = any (array[
    'independent_creator'::text,
    'studio'::text,
    'buyer'::text,
    'investor'::text,
    'platform_admin'::text
  ]));

do $migration$
declare
  matching_accounts integer;
begin
  select count(*) into matching_accounts
  from public.bridge_profiles
  where lower(trim(email)) = 'picturecrayons@gmail.com'
    and internal_role = 'super_admin'
    and email_verified = true;

  if matching_accounts > 1 then
    raise exception 'Expected at most one verified Super Admin profile for platform account classification; found %', matching_accounts;
  end if;

  -- Clean migration-replay databases do not contain the live account fixture.
  -- When the verified production/testing profile exists, update that one row.
  if matching_accounts = 1 then
    update public.bridge_profiles
    set account_type = 'platform_admin',
        updated_at = now()
    where lower(trim(email)) = 'picturecrayons@gmail.com'
      and internal_role = 'super_admin'
      and email_verified = true;
  end if;
end;
$migration$;

commit;
