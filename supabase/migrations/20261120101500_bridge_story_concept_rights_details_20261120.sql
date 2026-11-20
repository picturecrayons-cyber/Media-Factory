-- Story / Concept rights declaration detail fields.
-- Additive only. Do not apply to Production without a separately approved release.

alter table public.bridge_story_concept_submissions
  add column if not exists rights_basis_details text,
  add column if not exists third_party_materials_details text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bridge_story_concept_rights_basis_details_check'
  ) then
    alter table public.bridge_story_concept_submissions
      add constraint bridge_story_concept_rights_basis_details_check
      check (
        rights_basis <> 'OTHER'
        or nullif(btrim(rights_basis_details), '') is not null
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bridge_story_concept_third_party_details_check'
  ) then
    alter table public.bridge_story_concept_submissions
      add constraint bridge_story_concept_third_party_details_check
      check (
        third_party_materials_included is not true
        or nullif(btrim(third_party_materials_details), '') is not null
      ) not valid;
  end if;
end
$$;

comment on column public.bridge_story_concept_submissions.rights_basis_details is
  'Required explanation when the author selects OTHER as the rights basis.';
comment on column public.bridge_story_concept_submissions.third_party_materials_details is
  'Required description when the author declares third-party material is included.';
