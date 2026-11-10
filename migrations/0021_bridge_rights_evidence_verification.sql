-- Bridge licensing evidence verification (additive; do not apply without separate DB approval).
-- Evidence must point to a processed, checksummed DOCUMENT asset version.
-- Verification is a human legal-review attestation; this schema does not claim automated authenticity.

create table if not exists public.bridge_rights_evidence (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  rights_grant_id uuid not null references public.bridge_rights_grants(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('EXECUTED_AGREEMENT','OWNERSHIP_CHAIN','SIGNATORY_AUTHORITY','MASTER_DISTRIBUTOR_AUTHORITY','SUBLICENSING_AUTHORITY','SIGNED_AMENDMENT','SIGNED_ADDENDUM','RIGHTS_SCHEDULE')),
  related_agreement_evidence_id uuid references public.bridge_rights_evidence(id) on delete restrict,
  asset_version_id uuid not null references public.bridge_asset_versions(id) on delete restrict,
  checksum_sha256 char(64) not null check (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  submitted_by text not null,
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  check (
    (status = 'PENDING' and reviewed_by is null and reviewed_at is null)
    or
    (status in ('VERIFIED','REJECTED') and reviewed_by is not null and reviewed_at is not null)
  ),
  check (
    (evidence_type in ('SIGNED_AMENDMENT','SIGNED_ADDENDUM','RIGHTS_SCHEDULE') and related_agreement_evidence_id is not null)
    or
    (evidence_type not in ('SIGNED_AMENDMENT','SIGNED_ADDENDUM','RIGHTS_SCHEDULE') and related_agreement_evidence_id is null)
  ),
  unique (rights_grant_id, evidence_type, asset_version_id),
  -- The referenced agreement must belong to this exact title and grant.
  unique (id, title_id, rights_grant_id),
  foreign key (related_agreement_evidence_id, title_id, rights_grant_id)
    references public.bridge_rights_evidence(id, title_id, rights_grant_id)
    on delete restrict
);

create index if not exists bridge_rights_evidence_grant_status_idx
  on public.bridge_rights_evidence(rights_grant_id, status, evidence_type);

create table if not exists public.bridge_rights_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.bridge_rights_evidence(id) on delete restrict,
  decision text not null check (decision in ('VERIFIED','REJECTED')),
  reviewer_user_id text not null,
  evidence_checksum_sha256 char(64) not null check (evidence_checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists bridge_rights_evidence_reviews_evidence_idx
  on public.bridge_rights_evidence_reviews(evidence_id, created_at);

-- A unique, case-insensitive claim protects external settlement references.
-- Historical audit events remain untouched; the first valid reference claim is backfilled.
create table if not exists public.bridge_settlement_reference_claims (
  id uuid primary key default gen_random_uuid(),
  reference_normalized text not null unique check (reference_normalized <> ''),
  reference text not null,
  -- Nullable only for legacy references whose title/terms are incomplete or conflicting.
  -- Such claims are always REVIEW_REQUIRED and cannot be reused by the application.
  title_id text references public.bridge_titles(id) on delete restrict,
  invoice_reference text,
  statement_reference text,
  amount_paise bigint check (amount_paise is null or amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  claim_state text not null default 'ACTIVE' check (claim_state in ('ACTIVE','REVIEW_REQUIRED')),
  created_by text not null,
  created_at timestamptz not null default now()
);

-- Preserve every source audit event, including incomplete and conflicting records.
-- The original metadata is retained verbatim; the parent claim is only a deduplication guard.
create table if not exists public.bridge_settlement_reference_claim_events (
  id bigserial primary key,
  claim_id uuid not null references public.bridge_settlement_reference_claims(id) on delete restrict,
  source_audit_event_id integer not null unique references public.bridge_audit_logs(id) on delete restrict,
  reference_normalized text not null,
  source_entity_type text not null,
  source_entity_id text,
  source_metadata text not null,
  actor_user_id text not null,
  event_state text not null check (event_state in ('VALID','REVIEW_REQUIRED')),
  created_at timestamptz not null
);

create index if not exists bridge_settlement_reference_claim_events_claim_idx
  on public.bridge_settlement_reference_claim_events(claim_id, created_at, source_audit_event_id);

-- Do not discard references merely because invoice, statement, amount, title or entity type is
-- incomplete. Parse amounts as bounded numeric values before any bigint conversion.
with raw_events as (
  select
    id,
    metadata::jsonb as metadata_json,
    entity_type,
    entity_id,
    actor_user_id,
    created_at,
    metadata as source_metadata
  from public.bridge_audit_logs
  where action='finance.settlement_evidence'
    and jsonb_typeof(metadata::jsonb)='object'
),
events as (
  select
    id,
    upper(btrim(metadata_json->>'reference')) as reference_normalized,
    btrim(metadata_json->>'reference') as reference,
    entity_type,
    entity_id,
    nullif(btrim(metadata_json->>'invoiceReference'),'') as invoice_reference,
    nullif(btrim(metadata_json->>'statementReference'),'') as statement_reference,
    case
      when coalesce(metadata_json->>'amountPaise','') ~ '^[1-9][0-9]{0,18}

alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_evidence_reviews enable row level security;
alter table public.bridge_settlement_reference_claims enable row level security;
alter table public.bridge_settlement_reference_claim_events enable row level security;

-- Replace only a single, simple kind-membership check after inspecting its live definition.
-- Preserve every currently allowed kind. Abort the migration (transaction rolls back) if the
-- constraint is missing, duplicated, or has an expression we cannot safely extend.
do $
declare
  v_constraint_count integer;
  v_constraint_name text;
  v_definition text;
  v_kinds text[];
  v_values text;
begin
  select count(*) into v_constraint_count
  from pg_constraint
  where conrelid='public.bridge_assets'::regclass
    and contype='c'
    and pg_get_constraintdef(oid) ilike '%kind%';

  if v_constraint_count <> 1 then
    raise exception 'Expected exactly one bridge_assets kind check constraint; found %', v_constraint_count;
  end if;

  select conname, pg_get_constraintdef(oid)
    into v_constraint_name, v_definition
  from pg_constraint
  where conrelid='public.bridge_assets'::regclass
    and contype='c'
    and pg_get_constraintdef(oid) ilike '%kind%';

  if v_definition !~* '^CHECK ((kind = ANY (ARRAY[.*])))

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.

        then (metadata_json->>'amountPaise')::numeric
      else null
    end as amount_numeric,
    coalesce(nullif(btrim(metadata_json->>'currency'),''),'INR') as currency,
    actor_user_id,
    created_at,
    source_metadata
  from raw_events
  where nullif(btrim(metadata_json->>'reference'),'') is not null
),
reference_stats as (
  select
    reference_normalized,
    min(reference) as reference,
    count(*)::integer as event_count,
    count(distinct entity_type)::integer as entity_type_count,
    min(entity_type) as entity_type,
    count(distinct entity_id)::integer as entity_id_count,
    count(entity_id)::integer as entity_id_present_count,
    min(entity_id) as entity_id,
    count(distinct invoice_reference)::integer as invoice_count,
    count(invoice_reference)::integer as invoice_present_count,
    min(invoice_reference) as invoice_reference,
    count(distinct statement_reference)::integer as statement_count,
    count(statement_reference)::integer as statement_present_count,
    min(statement_reference) as statement_reference,
    count(distinct amount_numeric)::integer as amount_count,
    count(amount_numeric)::integer as amount_present_count,
    min(amount_numeric) as amount_numeric,
    count(distinct currency)::integer as currency_count,
    count(*) filter (where currency = 'INR')::integer as inr_count,
    min(actor_user_id) as created_by,
    min(created_at) as created_at
  from events
  group by reference_normalized
)
insert into public.bridge_settlement_reference_claims(
  reference_normalized,reference,title_id,invoice_reference,statement_reference,
  amount_paise,currency,claim_state,created_by,created_at
)
select
  s.reference_normalized,
  s.reference,
  case
    when s.entity_type_count=1 and s.entity_type='bridge_title'
      and s.entity_id_count=1 and s.entity_id_present_count=s.event_count
      and exists (select 1 from public.bridge_titles t where t.id=s.entity_id)
    then s.entity_id else null
  end,
  case when s.invoice_count=1 and s.invoice_present_count=s.event_count then s.invoice_reference else null end,
  case when s.statement_count=1 and s.statement_present_count=s.event_count then s.statement_reference else null end,
  case
    when s.amount_count=1 and s.amount_present_count=s.event_count
      and s.amount_numeric between 1 and 9223372036854775807::numeric
    then s.amount_numeric::bigint else null
  end,
  'INR',
  case
    when s.reference_normalized ~ '^(NOT[[:space:]]+(EXCECUTED|EXECUTED)|TBD|PENDING|UNEXECUTED)([[:space:]]|$)'
      or s.entity_type_count<>1 or s.entity_type<>'bridge_title'
      or s.entity_id_count<>1 or s.entity_id_present_count<>s.event_count
      or not exists (select 1 from public.bridge_titles t where t.id=s.entity_id)
      or s.invoice_count<>1 or s.invoice_present_count<>s.event_count
      or s.statement_count<>1 or s.statement_present_count<>s.event_count
      or s.amount_count<>1 or s.amount_present_count<>s.event_count
      or s.amount_numeric not between 1 and 9223372036854775807::numeric
      or s.currency_count<>1 or s.inr_count<>s.event_count
    then 'REVIEW_REQUIRED'
    else 'ACTIVE'
  end,
  s.created_by,
  s.created_at
from reference_stats s
on conflict (reference_normalized) do nothing;

-- Attach every non-empty historical reference event to its grouped claim.
with raw_events as (
  select id,metadata::jsonb as metadata_json,entity_type,entity_id,actor_user_id,created_at,metadata as source_metadata
  from public.bridge_audit_logs
  where action='finance.settlement_evidence'
    and jsonb_typeof(metadata::jsonb)='object'
),
events as (
  select
    id,
    upper(btrim(metadata_json->>'reference')) as reference_normalized,
    entity_type,
    entity_id,
    nullif(btrim(metadata_json->>'invoiceReference'),'') as invoice_reference,
    nullif(btrim(metadata_json->>'statementReference'),'') as statement_reference,
    case when coalesce(metadata_json->>'amountPaise','') ~ '^[1-9][0-9]{0,18}

alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_evidence_reviews enable row level security;
alter table public.bridge_settlement_reference_claims enable row level security;

-- Add a private rights-document upload kind without changing existing asset rows.
alter table public.bridge_assets drop constraint if exists bridge_assets_kind_chk;
alter table public.bridge_assets
  add constraint bridge_assets_kind_chk
  check (kind in (
    'poster','poster_vertical','poster_horizontal','thumbnail','screener','master',
    'subtitle','technical','censor_certificate','rights_document'
  ));

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.

      then (metadata_json->>'amountPaise')::numeric else null end as amount_numeric,
    coalesce(nullif(btrim(metadata_json->>'currency'),''),'INR') as currency,
    actor_user_id,
    created_at,
    source_metadata
  from raw_events
  where nullif(btrim(metadata_json->>'reference'),'') is not null
)
insert into public.bridge_settlement_reference_claim_events(
  claim_id,source_audit_event_id,reference_normalized,source_entity_type,
  source_entity_id,source_metadata,actor_user_id,event_state,created_at
)
select
  c.id,e.id,e.reference_normalized,e.entity_type,e.entity_id,e.source_metadata,e.actor_user_id,
  case
    when e.entity_type<>'bridge_title'
      or not exists (select 1 from public.bridge_titles t where t.id=e.entity_id)
      or e.invoice_reference is null or e.statement_reference is null
      or e.amount_numeric not between 1 and 9223372036854775807::numeric
      or e.currency<>'INR'
    then 'REVIEW_REQUIRED' else 'VALID'
  end,
  e.created_at
from events e
join public.bridge_settlement_reference_claims c using(reference_normalized)
on conflict (source_audit_event_id) do nothing;

alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_evidence_reviews enable row level security;
alter table public.bridge_settlement_reference_claims enable row level security;

-- Add a private rights-document upload kind without changing existing asset rows.
alter table public.bridge_assets drop constraint if exists bridge_assets_kind_chk;
alter table public.bridge_assets
  add constraint bridge_assets_kind_chk
  check (kind in (
    'poster','poster_vertical','poster_horizontal','thumbnail','screener','master',
    'subtitle','technical','censor_certificate','rights_document'
  ));

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.
 then
    raise exception 'Unsupported bridge_assets kind constraint definition: %', v_definition;
  end if;

  select array_agg(distinct m[1] order by m[1])
    into v_kinds
  from regexp_matches(v_definition, '''([^'']*)''', 'g') as m;

  if coalesce(cardinality(v_kinds),0)=0 then
    raise exception 'Could not read allowed kinds from bridge_assets constraint: %', v_definition;
  end if;

  if not ('rights_document'=any(v_kinds)) then
    v_kinds := array_append(v_kinds,'rights_document');
  end if;

  select string_agg(quote_literal(k),', ' order by k) into v_values
  from unnest(v_kinds) as k;

  execute format('alter table public.bridge_assets drop constraint %I',v_constraint_name);
  execute format('alter table public.bridge_assets add constraint bridge_assets_kind_chk check (kind in (%s))',v_values);
end
$;

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.

        then (metadata_json->>'amountPaise')::numeric
      else null
    end as amount_numeric,
    coalesce(nullif(btrim(metadata_json->>'currency'),''),'INR') as currency,
    actor_user_id,
    created_at,
    source_metadata
  from raw_events
  where nullif(btrim(metadata_json->>'reference'),'') is not null
),
reference_stats as (
  select
    reference_normalized,
    min(reference) as reference,
    count(*)::integer as event_count,
    count(distinct entity_type)::integer as entity_type_count,
    min(entity_type) as entity_type,
    count(distinct entity_id)::integer as entity_id_count,
    count(entity_id)::integer as entity_id_present_count,
    min(entity_id) as entity_id,
    count(distinct invoice_reference)::integer as invoice_count,
    count(invoice_reference)::integer as invoice_present_count,
    min(invoice_reference) as invoice_reference,
    count(distinct statement_reference)::integer as statement_count,
    count(statement_reference)::integer as statement_present_count,
    min(statement_reference) as statement_reference,
    count(distinct amount_numeric)::integer as amount_count,
    count(amount_numeric)::integer as amount_present_count,
    min(amount_numeric) as amount_numeric,
    count(distinct currency)::integer as currency_count,
    count(*) filter (where currency = 'INR')::integer as inr_count,
    min(actor_user_id) as created_by,
    min(created_at) as created_at
  from events
  group by reference_normalized
)
insert into public.bridge_settlement_reference_claims(
  reference_normalized,reference,title_id,invoice_reference,statement_reference,
  amount_paise,currency,claim_state,created_by,created_at
)
select
  s.reference_normalized,
  s.reference,
  case
    when s.entity_type_count=1 and s.entity_type='bridge_title'
      and s.entity_id_count=1 and s.entity_id_present_count=s.event_count
      and exists (select 1 from public.bridge_titles t where t.id=s.entity_id)
    then s.entity_id else null
  end,
  case when s.invoice_count=1 and s.invoice_present_count=s.event_count then s.invoice_reference else null end,
  case when s.statement_count=1 and s.statement_present_count=s.event_count then s.statement_reference else null end,
  case
    when s.amount_count=1 and s.amount_present_count=s.event_count
      and s.amount_numeric between 1 and 9223372036854775807::numeric
    then s.amount_numeric::bigint else null
  end,
  'INR',
  case
    when s.reference_normalized ~ '^(NOT[[:space:]]+(EXCECUTED|EXECUTED)|TBD|PENDING|UNEXECUTED)([[:space:]]|$)'
      or s.entity_type_count<>1 or s.entity_type<>'bridge_title'
      or s.entity_id_count<>1 or s.entity_id_present_count<>s.event_count
      or not exists (select 1 from public.bridge_titles t where t.id=s.entity_id)
      or s.invoice_count<>1 or s.invoice_present_count<>s.event_count
      or s.statement_count<>1 or s.statement_present_count<>s.event_count
      or s.amount_count<>1 or s.amount_present_count<>s.event_count
      or s.amount_numeric not between 1 and 9223372036854775807::numeric
      or s.currency_count<>1 or s.inr_count<>s.event_count
    then 'REVIEW_REQUIRED'
    else 'ACTIVE'
  end,
  s.created_by,
  s.created_at
from reference_stats s
on conflict (reference_normalized) do nothing;

-- Attach every non-empty historical reference event to its grouped claim.
with raw_events as (
  select id,metadata::jsonb as metadata_json,entity_type,entity_id,actor_user_id,created_at,metadata as source_metadata
  from public.bridge_audit_logs
  where action='finance.settlement_evidence'
    and jsonb_typeof(metadata::jsonb)='object'
),
events as (
  select
    id,
    upper(btrim(metadata_json->>'reference')) as reference_normalized,
    entity_type,
    entity_id,
    nullif(btrim(metadata_json->>'invoiceReference'),'') as invoice_reference,
    nullif(btrim(metadata_json->>'statementReference'),'') as statement_reference,
    case when coalesce(metadata_json->>'amountPaise','') ~ '^[1-9][0-9]{0,18}

alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_evidence_reviews enable row level security;
alter table public.bridge_settlement_reference_claims enable row level security;

-- Add a private rights-document upload kind without changing existing asset rows.
alter table public.bridge_assets drop constraint if exists bridge_assets_kind_chk;
alter table public.bridge_assets
  add constraint bridge_assets_kind_chk
  check (kind in (
    'poster','poster_vertical','poster_horizontal','thumbnail','screener','master',
    'subtitle','technical','censor_certificate','rights_document'
  ));

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.

      then (metadata_json->>'amountPaise')::numeric else null end as amount_numeric,
    coalesce(nullif(btrim(metadata_json->>'currency'),''),'INR') as currency,
    actor_user_id,
    created_at,
    source_metadata
  from raw_events
  where nullif(btrim(metadata_json->>'reference'),'') is not null
)
insert into public.bridge_settlement_reference_claim_events(
  claim_id,source_audit_event_id,reference_normalized,source_entity_type,
  source_entity_id,source_metadata,actor_user_id,event_state,created_at
)
select
  c.id,e.id,e.reference_normalized,e.entity_type,e.entity_id,e.source_metadata,e.actor_user_id,
  case
    when e.entity_type<>'bridge_title'
      or not exists (select 1 from public.bridge_titles t where t.id=e.entity_id)
      or e.invoice_reference is null or e.statement_reference is null
      or e.amount_numeric not between 1 and 9223372036854775807::numeric
      or e.currency<>'INR'
    then 'REVIEW_REQUIRED' else 'VALID'
  end,
  e.created_at
from events e
join public.bridge_settlement_reference_claims c using(reference_normalized)
on conflict (source_audit_event_id) do nothing;

alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_evidence_reviews enable row level security;
alter table public.bridge_settlement_reference_claims enable row level security;

-- Add a private rights-document upload kind without changing existing asset rows.
alter table public.bridge_assets drop constraint if exists bridge_assets_kind_chk;
alter table public.bridge_assets
  add constraint bridge_assets_kind_chk
  check (kind in (
    'poster','poster_vertical','poster_horizontal','thumbnail','screener','master',
    'subtitle','technical','censor_certificate','rights_document'
  ));

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.
