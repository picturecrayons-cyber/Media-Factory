-- Forward-only reconciliation of title workflow kinds and owner-submission event kinds.
-- Production Shoot remains an internal Studio workflow on bridge_titles.
-- Only Finished Film and Story / Concept belong to owner-submission events.
-- This migration preserves all existing rows and does not alter grants, RLS, or policies.

do $$
begin
  if exists (
    select 1 from public.bridge_titles
    where submission_type not in ('finished_film', 'story_concept', 'production_shoot')
       or submission_type is null
  ) then
    raise exception 'Cannot reconcile bridge_titles: unexpected submission_type values exist';
  end if;

  if exists (
    select 1 from public.bridge_owner_submission_events
    where submission_kind not in ('finished_film', 'story_concept')
       or submission_kind is null
  ) then
    raise exception 'Cannot reconcile bridge_owner_submission_events: unexpected submission_kind values exist';
  end if;
end
$$;

alter table public.bridge_titles
  drop constraint if exists bridge_titles_submission_type_check;
alter table public.bridge_titles
  add constraint bridge_titles_submission_type_check
  check (submission_type = any (array['finished_film'::text, 'story_concept'::text, 'production_shoot'::text])) not valid;
alter table public.bridge_titles
  validate constraint bridge_titles_submission_type_check;

alter table public.bridge_owner_submission_events
  drop constraint if exists bridge_owner_submission_events_submission_kind_check;
alter table public.bridge_owner_submission_events
  add constraint bridge_owner_submission_events_submission_kind_check
  check (submission_kind = any (array['finished_film'::text, 'story_concept'::text])) not valid;
alter table public.bridge_owner_submission_events
  validate constraint bridge_owner_submission_events_submission_kind_check;
