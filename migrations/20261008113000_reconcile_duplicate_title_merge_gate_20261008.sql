-- Reconcile the duplicate-title merge safety gate into migration history.
-- STAGING-first candidate. Never apply to PRODUCTION without separate approval.
-- scripts/migrate.mjs owns transaction boundaries; do not add BEGIN/COMMIT here.
--
-- Recovery contract:
-- * Preserve pre-migration direct ACL entries for anon/authenticated.
-- * Fail closed if a same-name policy exists with a different definition.
-- * Record whether this migration created each deny policy.
-- * The paired rollback SQL restores only captured ACLs and removes only
--   policies created here. It never drops merge-gate tables/columns/indexes,
--   which are owned by 0020_duplicate_title_merge_gate.sql.

create table if not exists public.bridge_title_merge_audits (
  merge_id uuid primary key default gen_random_uuid(),
  canonical_title_id text not null references public.bridge_titles(id) on delete restrict,
  retiring_title_id text not null,
  decision text not null check (decision in ('PREVIEW_SAFE','HOLD','BLOCK','MERGED','ROLLED_BACK')),
  decision_version text not null default 'v1',
  actor_user_id text,
  reason text,
  collision_scan jsonb not null default '{}'::jsonb,
  pre_merge_state jsonb not null default '{}'::jsonb,
  post_merge_state jsonb not null default '{}'::jsonb,
  rollback_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists bridge_title_merge_audits_titles_idx
  on public.bridge_title_merge_audits(canonical_title_id, retiring_title_id, created_at desc);

create table if not exists public.bridge_title_merge_aliases (
  retiring_title_id text primary key,
  canonical_title_id text not null references public.bridge_titles(id) on delete restrict,
  merge_id uuid not null references public.bridge_title_merge_audits(merge_id) on delete restrict,
  merged_at timestamptz not null default now()
);

alter table public.bridge_titles
  add column if not exists merged_into_title_id text references public.bridge_titles(id) on delete restrict;
alter table public.bridge_titles
  add column if not exists merged_at timestamptz;

create index if not exists bridge_titles_merged_into_idx
  on public.bridge_titles(merged_into_title_id);

create index if not exists bridge_title_merge_aliases_canonical_idx
  on public.bridge_title_merge_aliases(canonical_title_id);

-- Private rollback journal. It is RLS-enabled and inaccessible to browser roles.
create table if not exists public._bridge_title_merge_recovery (
  recovery_id bigserial primary key,
  migration_name text not null,
  target_table text not null,
  entry_type text not null check (entry_type in ('ACL','POLICY')),
  grantee_oid oid,
  privilege_type text,
  is_grantable boolean,
  policy_name text,
  policy_created boolean,
  created_at timestamptz not null default now()
);
revoke all privileges on table public._bridge_title_merge_recovery from public, anon, authenticated;
alter table public._bridge_title_merge_recovery enable row level security;

-- Snapshot direct table ACLs before changing them. Include only the two browser
-- roles whose grants this migration revokes. Role memberships are not changed.
insert into public._bridge_title_merge_recovery
  (migration_name, target_table, entry_type, grantee_oid, privilege_type, is_grantable)
select
  '20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql',
  c.relname,
  'ACL',
  acl.grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
join pg_roles grantee on grantee.oid = acl.grantee
where n.nspname = 'public'
  and c.relname in ('bridge_title_merge_audits', 'bridge_title_merge_aliases')
  and grantee.rolname in ('anon', 'authenticated');

revoke all privileges on table public.bridge_title_merge_audits from anon, authenticated;
revoke all privileges on table public.bridge_title_merge_aliases from anon, authenticated;

-- A same-name policy is accepted only when it is already the exact deny policy.
-- Otherwise stop rather than destroying an existing policy definition.
do $policies$
declare
  policy_row record;
  existing_policy_count integer;
  matching_policy_count integer;
begin
  for policy_row in
    select *
    from (values
      ('bridge_title_merge_audits', 'bridge_title_merge_audits_no_client_access'),
      ('bridge_title_merge_aliases', 'bridge_title_merge_aliases_no_client_access')
    ) as expected(table_name, policy_name)
  loop
    select count(*) into existing_policy_count
    from pg_policies
    where schemaname = 'public'
      and tablename = policy_row.table_name
      and policyname = policy_row.policy_name;

    select count(*) into matching_policy_count
    from pg_policies
    where schemaname = 'public'
      and tablename = policy_row.table_name
      and policyname = policy_row.policy_name
      and cmd = 'ALL'
      and cardinality(roles) = 2
      and roles @> array['anon', 'authenticated']::name[]
      and qual = 'false'
      and with_check = 'false';

    if existing_policy_count > 0 and matching_policy_count <> 1 then
      raise exception 'Existing policy %.% differs from required deny policy; refusing to replace it',
        policy_row.table_name, policy_row.policy_name;
    end if;

    insert into public._bridge_title_merge_recovery
      (migration_name, target_table, entry_type, policy_name, policy_created)
    values (
      '20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql',
      policy_row.table_name,
      'POLICY',
      policy_row.policy_name,
      existing_policy_count = 0
    );

    if existing_policy_count = 0 then
      execute format(
        'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
        policy_row.policy_name,
        policy_row.table_name
      );
    end if;
  end loop;
end
$policies$;

alter table public.bridge_title_merge_audits enable row level security;
alter table public.bridge_title_merge_aliases enable row level security;

-- Fail closed if an existing object with the same name has an incompatible shape.
do $verify$
declare
  missing_columns text;
begin
  select string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
    into missing_columns
  from (values
    ('bridge_title_merge_audits', 'merge_id'),
    ('bridge_title_merge_audits', 'canonical_title_id'),
    ('bridge_title_merge_audits', 'retiring_title_id'),
    ('bridge_title_merge_audits', 'decision'),
    ('bridge_title_merge_audits', 'decision_version'),
    ('bridge_title_merge_audits', 'actor_user_id'),
    ('bridge_title_merge_audits', 'reason'),
    ('bridge_title_merge_audits', 'collision_scan'),
    ('bridge_title_merge_audits', 'pre_merge_state'),
    ('bridge_title_merge_audits', 'post_merge_state'),
    ('bridge_title_merge_audits', 'rollback_state'),
    ('bridge_title_merge_audits', 'created_at'),
    ('bridge_title_merge_audits', 'completed_at'),
    ('bridge_title_merge_aliases', 'retiring_title_id'),
    ('bridge_title_merge_aliases', 'canonical_title_id'),
    ('bridge_title_merge_aliases', 'merge_id'),
    ('bridge_title_merge_aliases', 'merged_at'),
    ('bridge_titles', 'merged_into_title_id'),
    ('bridge_titles', 'merged_at')
  ) as required(table_name, column_name)
  left join information_schema.columns existing
    on existing.table_schema = 'public'
   and existing.table_name = required.table_name
   and existing.column_name = required.column_name
  where existing.column_name is null;

  if missing_columns is not null then
    raise exception 'Duplicate-title merge migration schema mismatch; missing columns: %', missing_columns;
  end if;
end
$verify$;
