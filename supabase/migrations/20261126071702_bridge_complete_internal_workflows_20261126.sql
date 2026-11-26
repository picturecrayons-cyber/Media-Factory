-- Bridge complete internal workflows: persisted task queue, explicit record classification,
-- and an explicit rights-grant reference for independent Legal review.
-- Server-only tables remain inaccessible to browser roles; application server functions
-- enforce verified internal-role authorization and write audit events.

alter table public.bridge_titles
  add column if not exists record_classification text not null default 'UNCLASSIFIED';

alter table public.bridge_titles
  add constraint bridge_titles_record_classification_check
  check (record_classification in ('PRODUCTION','TEST','LEGACY','UNCLASSIFIED'));

alter table public.bridge_legal_cases
  add column if not exists rights_grant_id uuid
  references public.bridge_rights_grants(id) on delete restrict;

create index if not exists bridge_legal_cases_grant_status_idx
  on public.bridge_legal_cases(rights_grant_id, status, reviewed_at desc);

create table if not exists public.bridge_internal_tasks (
  id uuid primary key default gen_random_uuid(),
  title_id text references public.bridge_titles(id) on delete restrict,
  task_type text not null check (task_type in (
    'QC_REVIEW','LEGAL_REVIEW','RIGHTS_REVIEW','ASSET_VERIFICATION',
    'MIGRATION_RECONCILIATION','PRODUCTION_CLASSIFICATION','GENERAL'
  )),
  assigned_role text not null check (assigned_role in (
    'admin','super_admin','qc_reviewer','legal_reviewer','finance','viewer'
  )),
  assigned_user_id text references public.bridge_profiles(user_id) on delete set null,
  status text not null default 'OPEN' check (status in (
    'OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELLED'
  )),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  summary text not null check (length(btrim(summary)) between 1 and 500),
  details jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text references public.bridge_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists bridge_internal_tasks_queue_idx
  on public.bridge_internal_tasks(assigned_role, status, priority, created_at desc);

create index if not exists bridge_internal_tasks_title_idx
  on public.bridge_internal_tasks(title_id, created_at desc);

alter table public.bridge_internal_tasks enable row level security;
revoke all on table public.bridge_internal_tasks from anon, authenticated;
revoke all on table public.bridge_internal_tasks from public;
revoke all on table public.bridge_legal_cases from anon, authenticated;
revoke all on table public.bridge_legal_cases from public;
