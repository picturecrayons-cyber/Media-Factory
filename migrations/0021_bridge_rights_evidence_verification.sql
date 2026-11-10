-- Bridge licensing evidence verification (additive; do not apply without separate DB approval).
-- Evidence must point to a processed, checksummed DOCUMENT asset version.
-- Verification is a human legal-review attestation; this schema does not claim automated authenticity.

create unique index if not exists bridge_rights_grants_id_title_uidx on public.bridge_rights_grants(id,title_id);

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
  foreign key (rights_grant_id,title_id) references public.bridge_rights_grants(id,title_id) on delete restrict,
  unique (id,title_id,rights_grant_id),
  foreign key (related_agreement_evidence_id,title_id,rights_grant_id)
    references public.bridge_rights_evidence(id,title_id,rights_grant_id) on delete restrict
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
-- Historical audit events remain untouched; every non-empty reference is preserved and reconciled.
create table if not exists public.bridge_settlement_reference_claims (
  id uuid primary key default gen_random_uuid(),
  reference_normalized text not null unique check (reference_normalized <> ''),
  reference text not null,
  title_id text references public.bridge_titles(id) on delete restrict,
  invoice_reference text,
  statement_reference text,
  amount_paise bigint check (amount_paise is null or amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  claim_state text not null default 'ACTIVE' check (claim_state in ('ACTIVE','REVIEW_REQUIRED')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bridge_settlement_reference_claim_events (
  id bigserial primary key,
  claim_id uuid not null references public.bridge_settlement_reference_claims(id) on delete restrict,
  source_audit_event_id integer not null unique references public.bridge_audit_logs(id) on delete restrict,
  reference_normalized text not null, source_entity_type text not null, source_entity_id text,
  source_metadata text not null, actor_user_id text not null,
  event_state text not null check (event_state in ('VALID','REVIEW_REQUIRED')),
  created_at timestamptz not null
);
create index if not exists bridge_settlement_reference_claim_events_claim_idx
  on public.bridge_settlement_reference_claim_events(claim_id,created_at,source_audit_event_id);

with raw_events as (
  select id,metadata::jsonb as j,entity_type,entity_id,actor_user_id,created_at,metadata as raw
  from public.bridge_audit_logs where action='finance.settlement_evidence' and jsonb_typeof(metadata::jsonb)='object'
), events as (
  select id,upper(btrim(j->>'reference')) as ref_norm,btrim(j->>'reference') as ref,entity_type,entity_id,
    nullif(btrim(j->>'invoiceReference'),'') as invoice_ref,nullif(btrim(j->>'statementReference'),'') as statement_ref,
    case when coalesce(j->>'amountPaise','') ~ '^[1-9][0-9]{0,18}$' then (j->>'amountPaise')::numeric end as amount_num,
    coalesce(nullif(btrim(j->>'currency'),''),'INR') as currency,actor_user_id,created_at,raw
  from raw_events where nullif(btrim(j->>'reference'),'') is not null
), stats as (
  select ref_norm,min(ref) ref,count(*)::int n,
    count(distinct entity_type)::int entity_type_n,min(entity_type) entity_type,
    count(distinct entity_id)::int title_n,count(entity_id)::int title_present,min(entity_id) title_id,
    count(distinct invoice_ref)::int invoice_n,count(invoice_ref)::int invoice_present,min(invoice_ref) invoice_ref,
    count(distinct statement_ref)::int statement_n,count(statement_ref)::int statement_present,min(statement_ref) statement_ref,
    count(distinct amount_num)::int amount_n,count(amount_num)::int amount_present,min(amount_num) amount_num,
    count(distinct currency)::int currency_n,count(*) filter(where currency='INR')::int inr_n,
    'legacy_backfill'::text actor,min(created_at) created_at
  from events group by ref_norm
)
insert into public.bridge_settlement_reference_claims(reference_normalized,reference,title_id,invoice_reference,statement_reference,amount_paise,currency,claim_state,created_by,created_at)
select ref_norm,ref_norm,
  case when entity_type_n=1 and entity_type='bridge_title' and title_n=1 and title_present=n
    and exists(select 1 from public.bridge_titles t where t.id=stats.title_id) then stats.title_id end,
  case when invoice_n=1 and invoice_present=n then invoice_ref end,
  case when statement_n=1 and statement_present=n then statement_ref end,
  case when amount_n=1 and amount_present=n and amount_num between 1 and 9223372036854775807::numeric then amount_num::bigint end,
  'INR',
  case when ref_norm ~ '^(NOT[[:space:]]+(EXCECUTED|EXECUTED)|TBD|PENDING|UNEXECUTED)([[:space:]]|$)'
    or entity_type_n<>1 or entity_type<>'bridge_title' or title_n<>1 or title_present<>n
    or not exists(select 1 from public.bridge_titles t where t.id=stats.title_id)
    or invoice_n<>1 or invoice_present<>n or statement_n<>1 or statement_present<>n
    or amount_n<>1 or amount_present<>n or amount_num is null or amount_num not between 1 and 9223372036854775807::numeric
    or currency_n<>1 or inr_n<>n then 'REVIEW_REQUIRED' else 'ACTIVE' end,
  actor,created_at from stats on conflict(reference_normalized) do nothing;

with raw_events as (
  select id,metadata::jsonb as j,entity_type,entity_id,actor_user_id,created_at,metadata as raw
  from public.bridge_audit_logs where action='finance.settlement_evidence' and jsonb_typeof(metadata::jsonb)='object'
), events as (
  select id,upper(btrim(j->>'reference')) ref_norm,entity_type,entity_id,
    nullif(btrim(j->>'invoiceReference'),'') invoice_ref,nullif(btrim(j->>'statementReference'),'') statement_ref,
    case when coalesce(j->>'amountPaise','') ~ '^[1-9][0-9]{0,18}$' then (j->>'amountPaise')::numeric end amount_num,
    coalesce(nullif(btrim(j->>'currency'),''),'INR') currency,actor_user_id,created_at,raw
  from raw_events where nullif(btrim(j->>'reference'),'') is not null
)
insert into public.bridge_settlement_reference_claim_events(claim_id,source_audit_event_id,reference_normalized,source_entity_type,source_entity_id,source_metadata,actor_user_id,event_state,created_at)
select c.id,e.id,e.ref_norm,e.entity_type,e.entity_id,e.raw,e.actor_user_id,
  case when e.entity_type<>'bridge_title' or not exists(select 1 from public.bridge_titles t where t.id=e.entity_id)
    or e.invoice_ref is null or e.statement_ref is null or e.amount_num is null
    or e.amount_num not between 1 and 9223372036854775807::numeric or e.currency<>'INR'
    then 'REVIEW_REQUIRED' else 'VALID' end,e.created_at
from events e join public.bridge_settlement_reference_claims c on c.reference_normalized=e.ref_norm
on conflict(source_audit_event_id) do nothing;

alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_evidence_reviews enable row level security;
alter table public.bridge_settlement_reference_claims enable row level security;
alter table public.bridge_settlement_reference_claim_events enable row level security;

-- Inspect the existing check, preserve all existing allowed kinds, and fail closed if its shape is unexpected.
do $$
declare v_count integer; v_name text; v_def text; v_kinds text[]; v_values text;
begin
  select count(*) into v_count from pg_constraint where conrelid='public.bridge_assets'::regclass
    and contype='c' and pg_get_constraintdef(oid) ilike '%kind%';
  if v_count<>1 then raise exception 'Expected one bridge_assets kind check; found %',v_count; end if;
  select conname,pg_get_constraintdef(oid) into v_name,v_def from pg_constraint
    where conrelid='public.bridge_assets'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%kind%';
  if v_def !~* '^CHECK \(\(kind = ANY \(ARRAY\[.*\]\)\)\)$' then
    raise exception 'Unsupported bridge_assets kind constraint: %',v_def;
  end if;
  select array_agg(distinct match[1] order by match[1]) into v_kinds
    from regexp_matches(v_def, '''([^'']*)''', 'g') as rm(match);
  if coalesce(cardinality(v_kinds),0)=0 then raise exception 'Cannot parse existing asset kinds: %',v_def; end if;
  if not ('rights_document'=any(v_kinds)) then v_kinds:=array_append(v_kinds,'rights_document'); end if;
  select string_agg(quote_literal(kind_value),', ' order by kind_value) into v_values from unnest(v_kinds) as u(kind_value);
  execute format('alter table public.bridge_assets drop constraint %I',v_name);
  execute format('alter table public.bridge_assets add constraint bridge_assets_kind_chk check (kind in (%s))',v_values);
end
$$;

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.
