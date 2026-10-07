-- Crayons Bridge production-safe duplicate-title reconciliation.
-- Review metadata only. This migration MUST NOT mutate bridge_titles, assets,
-- rights, deliveries, buyers, or Loop records.
--
-- Execution of a reconciliation remains a separate, approved server action.
-- Rights/identity-ambiguous candidates stay blocked.

begin;

create table if not exists public.bridge_title_duplicate_reviews (
  id text primary key,
  candidate_title_id text not null references public.bridge_titles(id) on delete restrict,
  canonical_title_id text references public.bridge_titles(id) on delete restrict,
  status text not null default 'DETECTED'
    check (status in ('DETECTED','REVIEW_REQUIRED','HOLD','APPROVED','RECONCILIATION_READY','RECONCILED','REJECTED','ROLLED_BACK')),
  identity_confidence text not null default 'UNCERTAIN'
    check (identity_confidence in ('CONFIRMED','PROBABLE','UNCERTAIN','CONFLICT')),
  identity_evidence jsonb not null default '[]'::jsonb,
  rights_conflict_status text not null default 'UNKNOWN'
    check (rights_conflict_status in ('CLEAR','CONFLICT','UNKNOWN','NOT_APPLICABLE')),
  territory_conflict_status text not null default 'UNKNOWN'
    check (territory_conflict_status in ('CLEAR','OVERLAP','CONFLICT','UNKNOWN','NOT_APPLICABLE')),
  window_conflict_status text not null default 'UNKNOWN'
    check (window_conflict_status in ('CLEAR','OVERLAP','CONFLICT','UNKNOWN','NOT_APPLICABLE')),
  asset_reference_status text not null default 'UNKNOWN'
    check (asset_reference_status in ('CLEAR','CONFLICT','UNKNOWN','NOT_APPLICABLE')),
  delivery_reference_status text not null default 'UNKNOWN'
    check (delivery_reference_status in ('CLEAR','CONFLICT','UNKNOWN','NOT_APPLICABLE')),
  buyer_mapping_status text not null default 'UNKNOWN'
    check (buyer_mapping_status in ('CLEAR','CONFLICT','UNKNOWN','NOT_APPLICABLE')),
  loop_identity_status text not null default 'BLOCKED'
    check (loop_identity_status in ('CLEAR','BLOCKED','CONFLICT','NOT_APPLICABLE')),
  proposed_action text not null default 'HOLD_FOR_IDENTITY'
    check (proposed_action in ('RETAIN_CANONICAL','REMAP_REFERENCES','NO_MERGE','HOLD_FOR_RIGHTS','HOLD_FOR_IDENTITY')),
  reviewer_id text,
  reviewed_at timestamptz,
  approval_id text,
  rollback_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (candidate_title_id <> canonical_title_id)
);

create unique index if not exists bridge_duplicate_active_candidate_idx
  on public.bridge_title_duplicate_reviews(candidate_title_id)
  where status not in ('REJECTED','ROLLED_BACK');

create index if not exists bridge_duplicate_canonical_idx
  on public.bridge_title_duplicate_reviews(canonical_title_id);

create table if not exists public.bridge_title_reconciliation_snapshots (
  reconciliation_id text primary key,
  review_id text not null references public.bridge_title_duplicate_reviews(id) on delete restrict,
  candidate_title_id text not null,
  canonical_title_id text not null,
  affected_object_ids jsonb not null default '[]'::jsonb,
  old_references jsonb not null default '[]'::jsonb,
  new_references jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bridge_title_reconciliation_events (
  id bigserial primary key,
  review_id text not null references public.bridge_title_duplicate_reviews(id) on delete restrict,
  event_type text not null
    check (event_type in (
      'DUPLICATE_REVIEW_CREATED',
      'CANONICAL_SELECTED',
      'CONFLICT_DETECTED',
      'RECONCILIATION_APPROVED',
      'REFERENCE_REPOINTED',
      'LOOP_RELEASE_BLOCKED',
      'RECONCILIATION_COMPLETED',
      'RECONCILIATION_ROLLED_BACK'
    )),
  actor_user_id text,
  object_type text,
  object_id text,
  old_reference text,
  new_reference text,
  reason_code text,
  approval_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.bridge_duplicate_title_loop_release_allowed(p_title_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.bridge_title_duplicate_reviews r
    where r.candidate_title_id = p_title_id
      and r.status not in ('REJECTED','ROLLED_BACK')
  );
$$;

revoke all on function public.bridge_duplicate_title_loop_release_allowed(text) from public;

-- These are server-authoritative operational tables. Do not create a browser
-- write surface for them.
revoke all on table public.bridge_title_duplicate_reviews from anon, authenticated;
revoke all on table public.bridge_title_reconciliation_snapshots from anon, authenticated;
revoke all on table public.bridge_title_reconciliation_events from anon, authenticated;

commit;
