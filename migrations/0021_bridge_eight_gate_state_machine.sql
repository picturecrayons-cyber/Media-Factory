-- Eight-stage Bridge gate control plane.
-- Additive and fail-closed: does not change title lifecycle/publication rows or seed data.
-- Apply only to isolated local PGLite first; never apply to production during HOLD.

begin;

alter table public.bridge_assets
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text,
  add column if not exists etag text,
  add column if not exists sha256 text;

create table if not exists public.bridge_gate_state (
  title_id text primary key references public.bridge_titles(id) on delete restrict,
  current_gate text,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint bridge_gate_state_current_gate_chk check (
    current_gate is null or current_gate in (
      'PREPARING','ASSET_VERIFICATION','QC','LEGAL',
      'LICENSE','DISTRIBUTION','PUBLICATION','REVENUE'
    )
  )
);

create table if not exists public.bridge_gate_audit_trail (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  from_gate text,
  to_gate text not null check (to_gate in (
    'PREPARING','ASSET_VERIFICATION','QC','LEGAL',
    'LICENSE','DISTRIBUTION','PUBLICATION','REVENUE'
  )),
  action text not null check (action = 'PASS'),
  actor_id text not null,
  actor_role text not null,
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  constraint bridge_gate_audit_evidence_object_chk check (
    jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb
  ),
  constraint bridge_gate_audit_role_chk check (
    actor_role in (
      'creator','studio','buyer','investor','admin','super_admin',
      'qc_reviewer','legal_reviewer','finance','viewer'
    )
  )
);

create index if not exists bridge_gate_audit_title_created_idx
  on public.bridge_gate_audit_trail(title_id, created_at desc);

alter table public.bridge_gate_state enable row level security;
alter table public.bridge_gate_audit_trail enable row level security;
revoke all on public.bridge_gate_state from public;
revoke all on public.bridge_gate_audit_trail from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.bridge_gate_state from anon';
    execute 'revoke all on public.bridge_gate_audit_trail from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.bridge_gate_state from authenticated';
    execute 'revoke all on public.bridge_gate_audit_trail from authenticated';
  end if;
end $$;

create or replace function public.bridge_guard_gate_state_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'GATE_STATE_DELETE_DENIED: gate state must be retained';
  end if;
  if current_setting('bridge.gate_transition', true) is distinct from 'on' then
    raise exception 'GATE_STATE_WRITE_DENIED: use bridge_transition_gate';
  end if;
  return new;
end;
$$;

drop trigger if exists bridge_gate_state_guard on public.bridge_gate_state;
create trigger bridge_gate_state_guard
before insert or update or delete on public.bridge_gate_state
for each row execute function public.bridge_guard_gate_state_write();

create or replace function public.bridge_reject_gate_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('bridge.gate_transition', true) is distinct from 'on' then
      raise exception 'GATE_AUDIT_INSERT_DENIED: use bridge_transition_gate';
    end if;
    return new;
  end if;
  raise exception 'GATE_AUDIT_IMMUTABLE: audit rows cannot be updated or deleted';
end;
$$;

drop trigger if exists bridge_gate_audit_immutable on public.bridge_gate_audit_trail;
create trigger bridge_gate_audit_immutable
before insert or update or delete on public.bridge_gate_audit_trail
for each row execute function public.bridge_reject_gate_audit_mutation();

create or replace function public.bridge_transition_gate(
  p_title_id text,
  p_to_gate text,
  p_actor_id text,
  p_actor_role text,
  p_evidence jsonb
)
returns public.bridge_gate_state
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.bridge_gate_state%rowtype;
  v_title public.bridge_titles%rowtype;
  v_expected_gate text;
  v_gate_order text[] := array[
    'PREPARING','ASSET_VERIFICATION','QC','LEGAL',
    'LICENSE','DISTRIBUTION','PUBLICATION','REVENUE'
  ];
  v_next_index integer;
  v_asset_count integer;
  v_verified_asset_count integer;
begin
  if p_title_id is null or length(trim(p_title_id)) = 0
     or p_actor_id is null or length(trim(p_actor_id)) = 0
     or p_actor_role is null or length(trim(p_actor_role)) = 0
     or p_to_gate is null or not (p_to_gate = any(v_gate_order))
     or p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
     or p_evidence = '{}'::jsonb then
    raise exception 'GATE_INPUT_INVALID: title, actor, gate and evidence are required';
  end if;

  select * into v_title
  from public.bridge_titles
  where id = p_title_id
  for update;

  if not found then
    raise exception 'TITLE_NOT_FOUND';
  end if;

  perform set_config('bridge.gate_transition', 'on', true);

  insert into public.bridge_gate_state(title_id)
  values (p_title_id)
  on conflict (title_id) do nothing;

  select * into v_state
  from public.bridge_gate_state
  where title_id = p_title_id
  for update;

  if v_state.current_gate is null then
    v_next_index := 1;
  else
    v_next_index := array_position(v_gate_order, v_state.current_gate) + 1;
  end if;

  if v_next_index is null or v_next_index > array_length(v_gate_order, 1) then
    raise exception 'GATE_SEQUENCE_COMPLETE: no further gate is available';
  end if;

  v_expected_gate := v_gate_order[v_next_index];
  if p_to_gate <> v_expected_gate then
    raise exception 'GATE_ORDER_BLOCKED: expected %, received %', v_expected_gate, p_to_gate;
  end if;

  if p_to_gate = 'PREPARING' then
    if p_actor_role not in ('creator','studio','admin','super_admin') then
      raise exception 'FORBIDDEN: role cannot certify PREPARING';
    end if;

  elsif p_to_gate = 'ASSET_VERIFICATION' then
    if p_actor_role <> 'super_admin' then
      raise exception 'FORBIDDEN: only Super Admin may certify asset verification';
    end if;
    select count(*), count(*) filter (
      where verified is true
        and verified_at is not null
        and verified_by is not null
        and byte_size > 0
        and content_type is not null
        and length(trim(content_type)) > 0
        and etag is not null
        and length(trim(etag)) > 0
        and sha256 ~ '^[0-9a-fA-F]{64}$'
    )
    into v_asset_count, v_verified_asset_count
    from public.bridge_assets
    where title_id = p_title_id;
    if v_asset_count = 0 or v_verified_asset_count <> v_asset_count then
      raise exception 'GATE_BLOCKED_ASSET_VERIFICATION: every title asset needs verified object, size, content type, ETag and SHA-256 evidence';
    end if;

  elsif p_to_gate = 'QC' then
    if p_actor_role not in ('qc_reviewer','super_admin') then
      raise exception 'FORBIDDEN: role cannot certify QC';
    end if;
    if p_actor_id = v_title.owner_user_id then
      raise exception 'SELF_APPROVAL_DENIED: title owner cannot approve QC';
    end if;
    if not exists (
      select 1 from public.bridge_qc_cases q
      where q.title_id = p_title_id and q.status = 'PASSED'
        and q.reviewed_by is not null and q.reviewed_at is not null
    ) then
      raise exception 'GATE_BLOCKED_QC: reviewed QC PASS evidence is required';
    end if;

  elsif p_to_gate = 'LEGAL' then
    if p_actor_role not in ('legal_reviewer','super_admin') then
      raise exception 'FORBIDDEN: role cannot certify LEGAL';
    end if;
    if p_actor_id = v_title.owner_user_id then
      raise exception 'SELF_APPROVAL_DENIED: title owner cannot approve LEGAL';
    end if;
    if not exists (
      select 1 from public.bridge_legal_cases l
      where l.title_id = p_title_id and l.status = 'APPROVED'
        and l.reviewed_by is not null and l.reviewed_at is not null
        and jsonb_typeof(l.evidence) = 'array' and l.evidence <> '[]'::jsonb
    ) then
      raise exception 'GATE_BLOCKED_LEGAL: reviewed legal approval with evidence is required';
    end if;

  elsif p_to_gate = 'LICENSE' then
    if p_actor_role not in ('legal_reviewer','super_admin') then
      raise exception 'FORBIDDEN: role cannot certify LICENSE';
    end if;
    if not exists (
      select 1 from public.bridge_rights_grants r
      where r.title_id = p_title_id and r.status = 'VALID'
        and (r.window_start is null or r.window_start <= now())
        and (r.window_end is null or r.window_end > now())
        and jsonb_typeof(r.evidence) = 'array' and r.evidence <> '[]'::jsonb
    ) then
      raise exception 'GATE_BLOCKED_LICENSE: active, evidence-backed rights grant is required';
    end if;

  elsif p_to_gate = 'DISTRIBUTION' then
    if p_actor_role not in ('admin','super_admin') then
      raise exception 'FORBIDDEN: role cannot certify DISTRIBUTION';
    end if;
    if not exists (
      select 1 from public.bridge_destination_packages d
      where d.title_id = p_title_id
        and d.readiness_state in ('READY','AUTHORIZED','DELIVERED')
        and d.rights_grant_id is not null
        and d.qc_case_id is not null
        and d.legal_case_id is not null
    ) then
      raise exception 'GATE_BLOCKED_DISTRIBUTION: ready package linked to QC, legal and rights evidence is required';
    end if;

  elsif p_to_gate = 'PUBLICATION' then
    if p_actor_role <> 'super_admin' then
      raise exception 'FORBIDDEN: only Super Admin may certify PUBLICATION';
    end if;
    if not exists (
      select 1
      from public.bridge_loop_publications p
      join public.loop_titles l on l.id = p.loop_title_id
      where p.bridge_title_id = p_title_id
        and p.authorization_status = 'authorized'
        and p.approved_by is not null and p.approved_at is not null
        and (p.window_start is null or p.window_start <= now())
        and (p.window_end is null or p.window_end > now())
        and l.bridge_title_id = p_title_id
        and l.published is true and l.listed is true and l.status = 'approved'
    ) then
      raise exception 'GATE_BLOCKED_PUBLICATION: explicit active Bridge authorization and approved, listed, published Loop title are required';
    end if;

  elsif p_to_gate = 'REVENUE' then
    if p_actor_role not in ('finance','super_admin') then
      raise exception 'FORBIDDEN: role cannot certify REVENUE';
    end if;
    if coalesce(length(trim(p_evidence->>'reporting_reference')), 0) = 0
       or coalesce(length(trim(p_evidence->>'reconciled_at')), 0) = 0 then
      raise exception 'GATE_BLOCKED_REVENUE: reporting reference and reconciliation timestamp are required';
    end if;
  end if;

  insert into public.bridge_gate_audit_trail(
    title_id, from_gate, to_gate, action, actor_id, actor_role, evidence
  ) values (
    p_title_id, v_state.current_gate, p_to_gate, 'PASS',
    p_actor_id, p_actor_role, p_evidence
  );

  update public.bridge_gate_state
  set current_gate = p_to_gate, updated_by = p_actor_id, updated_at = now()
  where title_id = p_title_id
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.bridge_transition_gate(text,text,text,text,jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.bridge_transition_gate(text,text,text,text,jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.bridge_transition_gate(text,text,text,text,jsonb) from authenticated';
  end if;
end $$;

comment on table public.bridge_gate_state is
  'Current eight-gate progression. A transaction-local guard requires bridge_transition_gate for writes; no client-role grants.';
comment on table public.bridge_gate_audit_trail is
  'Append-only gate decision evidence. Direct client access revoked; audit records retained when titles are retired.';
comment on function public.bridge_transition_gate(text,text,text,text,jsonb) is
  'Server-only, sequential, fail-closed eight-gate transition. Caller must perform application RBAC before invoking.';

commit;
