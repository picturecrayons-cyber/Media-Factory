-- DRAFT ONLY — NOT AN APPLIED MIGRATION
-- Purpose: move bridge_loop_identity_links.bridge_user_id FK from legacy
-- public."user"(id) to public.bridge_profiles(user_id).
-- Target: canonical Staging only, after owner/schema review.
-- DO NOT EXECUTE from this documentation branch.
--
-- Preconditions:
--   1. Confirm bridge_profiles.user_id is text PRIMARY KEY/UNIQUE.
--   2. Confirm every existing bridge_user_id has a bridge_profiles row.
--   3. Confirm the actual FK constraint name from pg_constraint.
--   4. Confirm the table and profile rows are from the intended Staging project.
--
-- Forward-only draft. No identity rows are created or rewritten.

begin;

do $preflight$
begin
  if to_regclass('public.bridge_loop_identity_links') is null then
    raise exception 'Preflight failed: public.bridge_loop_identity_links is missing';
  end if;
  if to_regclass('public.bridge_profiles') is null then
    raise exception 'Preflight failed: public.bridge_profiles is missing';
  end if;

  if exists (
    select 1
    from public.bridge_loop_identity_links l
    left join public.bridge_profiles p on p.user_id = l.bridge_user_id
    where p.user_id is null
  ) then
    raise exception 'Preflight failed: identity links contain bridge_user_id values without bridge_profiles rows';
  end if;
end
$preflight$;

-- Confirm the existing constraint name before using this draft.
-- Historical migration creates the default name below; do not silently
-- drop a differently named or additional FK.
alter table public.bridge_loop_identity_links
  drop constraint if exists bridge_loop_identity_links_bridge_user_id_fkey;

alter table public.bridge_loop_identity_links
  add constraint bridge_loop_identity_links_bridge_user_id_fkey
  foreign key (bridge_user_id)
  references public.bridge_profiles(user_id)
  on delete restrict;

commit;

-- Postflight (run separately as read-only verification after an approved apply):
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.bridge_loop_identity_links'::regclass
--   AND contype = 'f';
-- SELECT count(*) AS orphaned_identity_links
-- FROM public.bridge_loop_identity_links l
-- LEFT JOIN public.bridge_profiles p ON p.user_id = l.bridge_user_id
-- WHERE p.user_id IS NULL;
