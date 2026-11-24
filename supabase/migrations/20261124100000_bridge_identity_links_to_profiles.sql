-- Align Bridge identity links to the canonical Supabase Auth + Bridge profile model.
-- bridge_user_id -> public.bridge_profiles(user_id)
-- auth_user_id   -> auth.users(id)
-- This migration is intentionally additive and fails closed if existing links
-- cannot be reconciled to both authoritative identities.

do $$
begin
  if to_regclass('public.bridge_loop_identity_links') is null
     or to_regclass('public.bridge_profiles') is null then
    raise exception 'Bridge identity-link prerequisites are missing';
  end if;

  if exists (
    select 1
    from public.bridge_loop_identity_links l
    left join public.bridge_profiles p on p.user_id = l.bridge_user_id
    left join auth.users u on u.id = l.auth_user_id
    where p.user_id is null or u.id is null
  ) then
    raise exception 'Identity-link reconciliation blocked: an existing link has no matching Bridge profile or Supabase Auth user';
  end if;
end $$;

alter table public.bridge_loop_identity_links
  add column if not exists verification_method text;

alter table public.bridge_loop_identity_links
  add column if not exists verified_at timestamptz;

alter table public.bridge_loop_identity_links
  add column if not exists verified_by text;

update public.bridge_loop_identity_links
set verification_method = coalesce(verification_method, 'supabase_auth_onboarding'),
    verified_at = coalesce(verified_at, created_at, now()),
    verified_by = coalesce(verified_by, bridge_user_id);

alter table public.bridge_loop_identity_links
  alter column verification_method set not null,
  alter column verified_at set not null,
  alter column verified_by set not null;

alter table public.bridge_loop_identity_links
  drop constraint if exists bridge_loop_identity_links_bridge_user_id_fkey;

alter table public.bridge_loop_identity_links
  add constraint bridge_loop_identity_links_bridge_user_id_fkey
  foreign key (bridge_user_id)
  references public.bridge_profiles(user_id)
  on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_loop_identity_links'::regclass
      and conname = 'bridge_loop_identity_links_verification_method_check'
  ) then
    alter table public.bridge_loop_identity_links
      add constraint bridge_loop_identity_links_verification_method_check
      check (verification_method in (
        'verified_email_reauthentication',
        'manual_documented_review',
        'supabase_auth_onboarding'
      ));
  end if;
end $$;

comment on table public.bridge_loop_identity_links is
  'Explicit mapping from Supabase Auth identity to canonical Bridge profile; account role, organization authority and payment entitlements remain separate.';
