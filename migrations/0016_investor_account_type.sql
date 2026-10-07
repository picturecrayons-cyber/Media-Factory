-- Bridge role model: investor is a first-class external account type.
-- Existing investor participation/settlement tables are reused; no new investor data model is introduced.
alter table public.bridge_profiles
  drop constraint if exists bridge_profiles_account_type_chk;

alter table public.bridge_profiles
  add constraint bridge_profiles_account_type_chk
  check (account_type in ('independent_creator', 'studio', 'buyer', 'investor'));
