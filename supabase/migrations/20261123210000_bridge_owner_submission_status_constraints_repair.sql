-- Repair the owner-submission lifecycle checks to match every persisted
-- transition used by title-owner-submissions.ts.
-- Additive compatibility migration; does not create or alter title records.
-- Apply to Testing first. Production remains gated by exact-head CI and Preview RBAC.

alter table public.bridge_title_owner_submissions
  drop constraint if exists bridge_title_owner_submissions_submission_status_check;

alter table public.bridge_title_owner_submissions
  add constraint bridge_title_owner_submissions_submission_status_check
  check (submission_status in (
    'DRAFT',
    'SUBMITTED',
    'NEEDS_CORRECTION',
    'ACCEPTED_INTAKE',
    'WITHDRAWN',
    'REJECTED',
    'ARCHIVED'
  ));

alter table public.bridge_story_concept_submissions
  drop constraint if exists bridge_story_concept_owner_submission_status_check;

alter table public.bridge_story_concept_submissions
  add constraint bridge_story_concept_owner_submission_status_check
  check (owner_submission_status in (
    'DRAFT',
    'SUBMITTED',
    'NEEDS_CORRECTION',
    'ACCEPTED_INTAKE',
    'WITHDRAWN',
    'REJECTED',
    'ARCHIVED'
  ));

alter table public.bridge_owner_submission_events
  drop constraint if exists bridge_owner_submission_events_action_check;

alter table public.bridge_owner_submission_events
  add constraint bridge_owner_submission_events_action_check
  check (action in (
    'SUBMITTED',
    'RESUBMITTED',
    'ACCEPTED_INTAKE',
    'REQUEST_CHANGES',
    'WITHDRAWN',
    'REJECTED',
    'ARCHIVED'
  ));

alter table public.bridge_owner_submission_events
  drop constraint if exists bridge_owner_submission_events_to_status_check;

alter table public.bridge_owner_submission_events
  add constraint bridge_owner_submission_events_to_status_check
  check (to_status in (
    'DRAFT',
    'SUBMITTED',
    'NEEDS_CORRECTION',
    'ACCEPTED_INTAKE',
    'WITHDRAWN',
    'REJECTED',
    'ARCHIVED'
  ));
