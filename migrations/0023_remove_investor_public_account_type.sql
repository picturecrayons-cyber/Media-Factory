-- Investor participation records remain supported as operational data, but investor is no longer a public account type.
-- Fail closed rather than silently converting existing investor profiles into buyer accounts.
do $$
begin
  if exists (
    select 1 from public.bridge_profiles where account_type = 'investor'
  ) then
    raise exception 'Investor profiles exist. Review and explicitly remediate these accounts before applying this migration.';
  end if;
end
$$;

alter table public.bridge_profiles
  drop constraint if exists bridge_profiles_account_type_chk;

alter table public.bridge_profiles
  add constraint bridge_profiles_account_type_chk
  check (account_type in ('independent_creator', 'studio', 'buyer'));
