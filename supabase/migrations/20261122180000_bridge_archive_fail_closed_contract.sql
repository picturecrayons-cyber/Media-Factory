-- Bridge archive schema contract and fail-closed dependency inventory.
-- Additive only: no title rows are deleted or rewritten by this migration.

alter table public.bridge_titles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text,
  add column if not exists previous_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.bridge_titles'::regclass
      and conname='bridge_titles_archive_state_check'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_archive_state_check
      check (
        (archived_at is null and archived_by is null and archive_reason is null and previous_status is null)
        or (archived_at is not null and archived_by is not null
            and length(btrim(archive_reason)) between 3 and 2000
            and previous_status = 'DRAFT')
      ) not valid;
  end if;
end $$;

create index if not exists bridge_titles_active_owner_updated_idx
  on public.bridge_titles(owner_user_id, updated_at desc)
  where archived_at is null;
create index if not exists bridge_titles_archived_owner_updated_idx
  on public.bridge_titles(owner_user_id, archived_at desc)
  where archived_at is not null;

create table if not exists public.bridge_title_archive_events (
  id bigserial primary key,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  action text not null check (action in ('ARCHIVED','RESTORED')),
  actor_user_id text not null references public.bridge_profiles(user_id),
  actor_role text not null,
  organization_id uuid,
  previous_state jsonb not null,
  new_state jsonb not null,
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists bridge_title_archive_events_title_created_idx
  on public.bridge_title_archive_events(title_id, created_at desc);
alter table public.bridge_title_archive_events enable row level security;
revoke all on table public.bridge_title_archive_events from public, anon, authenticated;
grant select, insert on table public.bridge_title_archive_events to service_role;
grant usage, select on sequence public.bridge_title_archive_events_id_seq to service_role;

create or replace function public.bridge_reject_title_archive_event_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'Title archive event ledger is append-only';
end $$;
revoke all on function public.bridge_reject_title_archive_event_mutation() from public, anon, authenticated;
drop trigger if exists bridge_title_archive_events_immutable on public.bridge_title_archive_events;
create trigger bridge_title_archive_events_immutable
before update or delete on public.bridge_title_archive_events
for each row execute function public.bridge_reject_title_archive_event_mutation();

create or replace function public.bridge_title_archive_dependency_blockers(p_title_id text)
returns text[]
language plpgsql
security invoker
set search_path = pg_catalog, public, bridge_private
as $$
declare
  item record;
  has_reference boolean;
  blockers text[] := array[]::text[];
  required_table text;
  required_tables text[] := array[
    'public.bridge_titles',
    'public.bridge_profiles',
    'public.bridge_organization_memberships',
    'public.bridge_audit_logs',
    'public.bridge_assets',
    'public.bridge_asset_versions',
    'public.bridge_buyer_title_access',
    'public.bridge_delivery_jobs',
    'public.bridge_destination_packages',
    'public.bridge_dit_ingest_sessions',
    'public.bridge_financial_ledger',
    'public.bridge_language_rights',
    'public.bridge_legal_cases',
    'public.bridge_license_packages',
    'public.bridge_loop_publications',
    'public.bridge_package_entitlements',
    'public.bridge_production_assets',
    'public.bridge_qc_cases',
    'public.bridge_rights_grants',
    'public.bridge_service_orders',
    'public.bridge_service_quotes',
    'public.bridge_service_settlement_rules',
    'public.bridge_story_concept_submissions',
    'public.bridge_title_document_links',
    'public.bridge_title_events',
    'public.bridge_title_gate_certifications',
    'public.bridge_title_owner_submissions',
    'public.bridge_title_submission_intake',
    'public.loop_titles',
    'public.streamvista_legacy_links',
    'public.bridge_title_archive_events'
  ];
begin
  if p_title_id is null or length(btrim(p_title_id)) = 0 then
    return array['invalid:title_id'];
  end if;

  foreach required_table in array required_tables loop
    if to_regclass(required_table) is null then
      blockers := array_append(blockers, 'schema:' || required_table || ':missing');
    end if;
  end loop;
  if cardinality(blockers) > 0 then
    return blockers;
  end if;

  -- Validate the exact columns used by the archive lifecycle and dependency
  -- scan before dynamic SQL runs. Missing columns must block archival.
  for item in
    select * from (values
      ('public','bridge_titles','id'),('public','bridge_titles','slug'),
      ('public','bridge_titles','status'),('public','bridge_titles','owner_user_id'),
      ('public','bridge_titles','owner_account_type'),('public','bridge_titles','owner_organization_id'),
      ('public','bridge_titles','archived_at'),('public','bridge_titles','archived_by'),
      ('public','bridge_titles','archive_reason'),('public','bridge_titles','previous_status'),
      ('public','bridge_titles','master_key'),('public','bridge_titles','poster_key'),
      ('public','bridge_profiles','user_id'),
      ('public','bridge_organization_memberships','organization_id'),
      ('public','bridge_organization_memberships','user_id'),
      ('public','bridge_organization_memberships','status'),
      ('public','bridge_audit_logs','actor_user_id'),('public','bridge_audit_logs','action'),
      ('public','bridge_audit_logs','entity_type'),('public','bridge_audit_logs','entity_id'),
      ('public','bridge_audit_logs','metadata'),
      ('public','bridge_title_archive_events','title_id'),('public','bridge_title_archive_events','action'),
      ('public','bridge_title_archive_events','actor_user_id'),('public','bridge_title_archive_events','actor_role'),
      ('public','bridge_title_archive_events','organization_id'),('public','bridge_title_archive_events','previous_state'),
      ('public','bridge_title_archive_events','new_state'),('public','bridge_title_archive_events','reason'),
      ('public','bridge_assets','title_id'),('public','bridge_asset_versions','title_id'),
      ('public','bridge_buyer_title_access','title_id'),('public','bridge_delivery_jobs','title_id'),
      ('public','bridge_destination_packages','title_id'),('public','bridge_dit_ingest_sessions','title_id'),
      ('public','bridge_financial_ledger','title_id'),('public','bridge_language_rights','title_id'),
      ('public','bridge_legal_cases','title_id'),('public','bridge_license_packages','title_id'),
      ('public','bridge_loop_publications','bridge_title_id'),('public','bridge_package_entitlements','title_id'),
      ('public','bridge_production_assets','title_id'),('public','bridge_qc_cases','title_id'),
      ('public','bridge_rights_grants','title_id'),('public','bridge_service_orders','title_id'),
      ('public','bridge_service_quotes','title_id'),('public','bridge_service_settlement_rules','title_id'),
      ('public','bridge_story_concept_submissions','title_id'),('public','bridge_title_document_links','title_id'),
      ('public','bridge_title_events','title_id'),('public','bridge_title_events','from_status'),
      ('public','bridge_title_events','to_status'),('public','bridge_title_gate_certifications','title_id'),
      ('public','bridge_title_owner_submissions','title_id'),('public','bridge_title_submission_intake','title_id'),
      ('public','loop_titles','bridge_title_id'),('public','streamvista_legacy_links','bridge_title_id')
    ) as expected(schema_name,table_name,column_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema=item.schema_name
        and c.table_name=item.table_name
        and c.column_name=item.column_name
    ) then
      blockers := array_append(
        blockers,
        'schema:' || item.schema_name || '.' || item.table_name || '.' || item.column_name || ':missing'
      );
    end if;
  end loop;
  if cardinality(blockers) > 0 then
    return blockers;
  end if;

  for item in
    select distinct ns.nspname as schema_name, cls.relname as table_name,
           att.attname as column_name
    from pg_class cls
    join pg_namespace ns on ns.oid=cls.relnamespace
    join pg_attribute att on att.attrelid=cls.oid
    where ns.nspname in ('public','bridge_private')
      and cls.relkind in ('r','p')
      and att.attnum > 0 and not att.attisdropped
      and (
        att.attname in ('title_id','bridge_title_id')
        or exists (
          select 1 from pg_constraint fk
          where fk.contype='f' and fk.conrelid=cls.oid
            and att.attnum = any(fk.conkey)
            and fk.confrelid='public.bridge_titles'::regclass
        )
      )
  loop
    if item.schema_name='public' and item.table_name='bridge_title_archive_events' then
      continue;
    end if;

    if item.schema_name='public' and item.table_name='bridge_title_events'
       and item.column_name='title_id' then
      execute format(
        'select exists (select 1 from %I.%I where %I=$1 and not (from_status is null and to_status=''DRAFT''))',
        item.schema_name,item.table_name,item.column_name
      ) into has_reference using p_title_id;
    else
      execute format(
        'select exists (select 1 from %I.%I where %I=$1)',
        item.schema_name,item.table_name,item.column_name
      ) into has_reference using p_title_id;
    end if;

    if has_reference then
      blockers := array_append(blockers, item.schema_name || '.' || item.table_name || '.' || item.column_name);
    end if;
  end loop;
  return blockers;
end;
$$;
revoke all on function public.bridge_title_archive_dependency_blockers(text) from public, anon, authenticated;
grant execute on function public.bridge_title_archive_dependency_blockers(text) to service_role;
