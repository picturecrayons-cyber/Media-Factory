-- Crayons Bridge rights-ready public submission support.
-- Additive and fail-closed. Public intake creates canonical title + draft rights/legal/package records.
alter table public.bridge_titles
  add column if not exists rights_submission_status text not null default 'INTAKE'
    check (rights_submission_status in ('INTAKE','UNDER_REVIEW','READY','REJECTED'));

create index if not exists bridge_titles_rights_submission_status_idx
  on public.bridge_titles(rights_submission_status);

comment on column public.bridge_titles.rights_submission_status is
  'Public submission readiness marker. Licensing Ready remains server-gated by QC, legal, rights and verified assets.';

-- Keep these records private to the Bridge service role. No client grants are added.
alter table public.bridge_rights_grants enable row level security;
alter table public.bridge_legal_cases enable row level security;
alter table public.bridge_destination_packages enable row level security;
