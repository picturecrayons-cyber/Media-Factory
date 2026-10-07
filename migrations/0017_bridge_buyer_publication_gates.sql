-- Crayons Bridge six-gate Buyer publication control plane
-- Additive and fail-closed. Existing legacy LIVE_FOR_BUYERS rows are not deleted.
create table if not exists public.bridge_title_gate_certifications (
  title_id text primary key references public.bridge_titles(id) on delete cascade,
  ott_preparation_status text not null default 'HOLD'
    check (ott_preparation_status in ('HOLD','READY','FAILED')),
  packaging_status text not null default 'HOLD'
    check (packaging_status in ('HOLD','COMPLETE','FAILED')),
  curation_status text not null default 'HOLD'
    check (curation_status in ('HOLD','APPROVED','REJECTED')),
  delivery_status text not null default 'HOLD'
    check (delivery_status in ('HOLD','READY','FAILED','REVOKED')),
  evidence jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_title_gate_certifications_delivery_idx
  on public.bridge_title_gate_certifications(delivery_status);

alter table public.bridge_title_gate_certifications enable row level security;

create or replace function public.bridge_title_buyer_visibility(p_title_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.bridge_titles t
    join public.bridge_title_gate_certifications g on g.title_id = t.id
    where t.id = p_title_id
      and t.status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
      and exists (
        select 1 from public.bridge_qc_cases q
        where q.title_id = t.id and q.status = 'PASSED'
      )
      and exists (
        select 1 from public.bridge_legal_cases l
        where l.title_id = t.id and l.status = 'APPROVED'
      )
      and g.ott_preparation_status = 'READY'
      and g.packaging_status = 'COMPLETE'
      and g.curation_status = 'APPROVED'
      and g.delivery_status = 'READY'
      and exists (
        select 1 from public.bridge_destination_packages p
        where p.title_id = t.id
          and p.readiness_state in ('READY','AUTHORIZED','DELIVERED')
      )
  );
$$;

create or replace function public.bridge_assert_buyer_publishable(p_title_id text)
returns void
language plpgsql
stable
as $$
begin
  if not public.bridge_title_buyer_visibility(p_title_id) then
    raise exception 'TITLE_NOT_BUYER_PUBLISHABLE: all six certification gates and destination delivery readiness are required';
  end if;
end;
$$;

create or replace function public.bridge_block_uncertified_live_title()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'LIVE_FOR_BUYERS'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.bridge_assert_buyer_publishable(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists bridge_block_uncertified_live_title on public.bridge_titles;
create trigger bridge_block_uncertified_live_title
before insert or update of status on public.bridge_titles
for each row execute function public.bridge_block_uncertified_live_title();

-- Backstop: a title can never be buyer-visible merely because a legacy status survives.
comment on table public.bridge_title_gate_certifications is
  'Six-gate publication evidence. Buyer visibility is derived server-side and fails closed.';
