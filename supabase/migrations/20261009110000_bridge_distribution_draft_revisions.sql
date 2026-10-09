-- Append-only, database-enforced version history for Distribution Desk draft changes.
create table if not exists public.bridge_distribution_draft_revisions (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.bridge_distribution_inquiries(id) on delete restrict,
  action text not null check (action in ('CREATED','EDITED','APPROVED')),
  previous_subject text,
  previous_body text,
  previous_status text,
  next_subject text not null,
  next_body text not null,
  next_status text not null,
  actor_user_id text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists bridge_distribution_draft_revisions_inquiry_idx
  on public.bridge_distribution_draft_revisions(inquiry_id, recorded_at, id);
alter table public.bridge_distribution_draft_revisions enable row level security;
-- No client policies. Read/write only via permission-checked server-side database access.
create or replace function public.bridge_distribution_draft_revision_guard()
returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Distribution draft revision ledger is append-only';
  end if;
  return new;
end;
$$;
drop trigger if exists bridge_distribution_draft_revisions_immutable on public.bridge_distribution_draft_revisions;
create trigger bridge_distribution_draft_revisions_immutable
before update or delete on public.bridge_distribution_draft_revisions
for each row execute function public.bridge_distribution_draft_revision_guard();

create or replace function public.bridge_distribution_draft_revision_capture()
returns trigger language plpgsql as $$
declare
  v_action text;
  v_previous_subject text;
  v_previous_body text;
  v_previous_status text;
begin
  if tg_op = 'INSERT' then
    v_action := 'CREATED';
    v_previous_subject := null;
    v_previous_body := null;
    v_previous_status := null;
  else
    if new.draft_subject is distinct from old.draft_subject or new.draft_body is distinct from old.draft_body then
      v_action := 'EDITED';
    elsif new.status = 'APPROVED_DRAFT' and old.status is distinct from new.status then
      v_action := 'APPROVED';
    else
      return new;
    end if;
    v_previous_subject := old.draft_subject;
    v_previous_body := old.draft_body;
    v_previous_status := old.status;
  end if;
  insert into public.bridge_distribution_draft_revisions
    (inquiry_id, action, previous_subject, previous_body, previous_status,
     next_subject, next_body, next_status, actor_user_id)
  values
    (new.id, v_action, v_previous_subject, v_previous_body, v_previous_status,
     new.draft_subject, new.draft_body, new.status, coalesce(new.updated_by, new.created_by, 'unknown'));
  return new;
end;
$$;
drop trigger if exists bridge_distribution_draft_revision_capture on public.bridge_distribution_inquiries;
create trigger bridge_distribution_draft_revision_capture
after insert or update on public.bridge_distribution_inquiries
for each row execute function public.bridge_distribution_draft_revision_capture();
