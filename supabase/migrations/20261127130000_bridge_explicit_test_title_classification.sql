-- Explicit, reversible-by-forward-correction classification for known test fixtures.
-- Production did not yet have this field; Testing already has it, so this is additive/idempotent.
alter table public.bridge_titles
  add column if not exists record_classification text not null default 'UNCLASSIFIED';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_titles'::regclass
      and conname = 'bridge_titles_record_classification_check'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_record_classification_check
      check (record_classification in ('PRODUCTION','TEST','LEGACY','UNCLASSIFIED'));
  end if;
end
$$;

-- Exact IDs from verified Testing fixtures and the supplied Production Studio list.
-- No title-name heuristics, deletion, archival, or lifecycle changes.
update public.bridge_titles
set record_classification = 'TEST', updated_at = now()
where id in (
  '7d791a708c4b1384e2543101873fccbe',
  '86c01f36770066c716df7a6c0148e133',
  '3b9b45ab1af35bd1f9251aebb50b9e24',
  'test-fixture-free-video-20261124',
  'test-fixture-paid-film-20261124',
  'ef7beeb5944445286c73294a0f3edfed',
  '43d183d2da9e0c673df9c85d2db11d46',
  '7f6265b66013abe582dc5e16aabe7b15',
  '4b6fa1e61c4268dcea5ea0865295088b',
  'd8c1d183d047835e96ebdc5b3df35613',
  '518bf0368deafaae8c480e637a0753ff'
)
  and record_classification <> 'TEST';

-- Jananam was already submitted to QC in Production, but its queue case was
-- missing. Reconcile only that submitted title to a PENDING case; never approve it.
insert into public.bridge_qc_cases (
  title_id, status, automated_findings, reviewer_findings
)
select t.id, 'PENDING', '[]'::jsonb, '[]'::jsonb
from public.bridge_titles t
where t.id = 'cb8c141dc72d727a53a4f35d8851e100'
  and t.status = 'QC_REVIEW'
  and exists (
    select 1 from public.bridge_title_events e
    where e.title_id = t.id
      and e.from_status = 'PREPARING'
      and e.to_status = 'QC_REVIEW'
  )
  and not exists (
    select 1 from public.bridge_qc_cases c where c.title_id = t.id
  );
