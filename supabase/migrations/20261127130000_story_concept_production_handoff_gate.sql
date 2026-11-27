-- Explicit readiness-approved Story / Concept to Production handoff.
-- A handoff preserves the original concept title and links a new Finished Film
-- draft to a Production project. It does not approve QC, Rights, Legal or publish.

alter table public.bridge_story_concept_readiness_reviews
  add column if not exists production_organization_id uuid
    references public.bridge_organizations(id) on delete restrict,
  add column if not exists production_project_id uuid
    references public.bridge_production_projects(id) on delete restrict,
  add column if not exists finished_film_title_id text
    references public.bridge_titles(id) on delete restrict,
  add column if not exists handed_off_by text
    references public.bridge_profiles(user_id) on delete restrict,
  add column if not exists handed_off_at timestamptz;

alter table public.bridge_story_concept_readiness_reviews
  drop constraint if exists bridge_story_concept_readiness_reviews_readiness_status_check;
alter table public.bridge_story_concept_readiness_reviews
  add constraint bridge_story_concept_readiness_reviews_readiness_status_check
  check (readiness_status in ('PENDING','APPROVED','REJECTED','HANDED_OFF'));

alter table public.bridge_story_concept_readiness_reviews
  drop constraint if exists bridge_story_concept_readiness_reviewed_fields_check;
alter table public.bridge_story_concept_readiness_reviews
  add constraint bridge_story_concept_readiness_reviewed_fields_check
  check (
    (readiness_status = 'PENDING' and reviewed_by is null and reviewed_at is null)
    or (readiness_status in ('APPROVED','REJECTED','HANDED_OFF')
        and reviewed_by is not null and reviewed_at is not null)
  );

alter table public.bridge_story_concept_readiness_reviews
  drop constraint if exists bridge_story_concept_readiness_handoff_fields_check;
alter table public.bridge_story_concept_readiness_reviews
  add constraint bridge_story_concept_readiness_handoff_fields_check
  check (
    (readiness_status <> 'HANDED_OFF')
    or (production_organization_id is not null
        and production_project_id is not null
        and finished_film_title_id is not null
        and handed_off_by is not null
        and handed_off_at is not null)
  );

create unique index if not exists bridge_story_concept_readiness_project_uidx
  on public.bridge_story_concept_readiness_reviews (production_project_id)
  where production_project_id is not null;
create unique index if not exists bridge_story_concept_readiness_output_title_uidx
  on public.bridge_story_concept_readiness_reviews (finished_film_title_id)
  where finished_film_title_id is not null;

alter table public.bridge_production_title_links
  drop constraint if exists bridge_production_title_links_link_type_check;
alter table public.bridge_production_title_links
  add constraint bridge_production_title_links_link_type_check
  check (link_type in ('STORY_CONCEPT_SOURCE','FINISHED_FILM_OUTPUT'));
