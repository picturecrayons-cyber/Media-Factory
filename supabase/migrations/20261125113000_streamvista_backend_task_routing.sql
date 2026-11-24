-- Route StreamVista service work to backend validation first.
-- Human review remains explicit for QC and other approval decisions.
alter table public.streamvista_jobs
  add column if not exists assigned_to text not null default 'backend',
  add column if not exists decision_required boolean not null default false;

update public.streamvista_jobs
set assigned_to = 'human_review',
    decision_required = true
where step in ('source_qc', 'qc_review', 'legal_review', 'rights_review');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'streamvista_jobs_assigned_to_check'
      and conrelid = 'public.streamvista_jobs'::regclass
  ) then
    alter table public.streamvista_jobs
      add constraint streamvista_jobs_assigned_to_check
      check (assigned_to in ('backend', 'human_review'));
  end if;
end $$;

create index if not exists streamvista_jobs_backend_queue_idx
  on public.streamvista_jobs (assigned_to, status, created_at);
