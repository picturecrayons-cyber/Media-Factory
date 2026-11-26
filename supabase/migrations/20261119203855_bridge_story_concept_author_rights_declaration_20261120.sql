-- Reconciled source for Production migration 20261119203855.
-- The same additive schema change is already recorded on Production as
-- bridge_story_concept_author_rights_declaration_20261120.
-- Keep this version aligned with the Production ledger; do not reapply it there.

alter table public.bridge_story_concept_submissions
  add column if not exists rights_holder_name text,
  add column if not exists rights_basis text,
  add column if not exists third_party_materials_included boolean,
  add column if not exists rights_declaration_accepted_at timestamptz,
  add column if not exists rights_declaration_version text,
  add column if not exists editorial_status text not null default 'PENDING',
  add column if not exists editorial_reviewed_by text,
  add column if not exists editorial_reviewed_at timestamptz,
  add column if not exists editorial_review_notes text,
  add column if not exists legal_status text not null default 'PENDING',
  add column if not exists legal_reviewed_by text,
  add column if not exists legal_reviewed_at timestamptz,
  add column if not exists legal_review_notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bridge_story_concept_rights_basis_check') then
    alter table public.bridge_story_concept_submissions
      add constraint bridge_story_concept_rights_basis_check
      check (rights_basis is null or rights_basis in ('ORIGINAL_AUTHOR', 'ASSIGNED', 'LICENSED', 'PUBLIC_DOMAIN', 'OTHER'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bridge_story_concept_editorial_status_check') then
    alter table public.bridge_story_concept_submissions
      add constraint bridge_story_concept_editorial_status_check
      check (editorial_status in ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bridge_story_concept_legal_status_check') then
    alter table public.bridge_story_concept_submissions
      add constraint bridge_story_concept_legal_status_check
      check (legal_status in ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO'));
  end if;
end $$;

create index if not exists bridge_story_concept_editorial_queue_idx
  on public.bridge_story_concept_submissions (editorial_status, created_at);
create index if not exists bridge_story_concept_legal_queue_idx
  on public.bridge_story_concept_submissions (legal_status, created_at);

comment on column public.bridge_story_concept_submissions.rights_holder_name is
  'Declared rights holder; declaration is a claim and is not legal verification.';
comment on column public.bridge_story_concept_submissions.rights_declaration_accepted_at is
  'Timestamp of the submitter accepting the versioned rights declaration.';
comment on column public.bridge_story_concept_submissions.editorial_status is
  'Independent editorial assessment; does not grant rights or authorize publication.';
comment on column public.bridge_story_concept_submissions.legal_status is
  'Independent legal assessment; approval does not itself publish or license a title.';