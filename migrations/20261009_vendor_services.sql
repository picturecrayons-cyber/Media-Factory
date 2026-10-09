-- StreamVista / Crayons Bridge vendor service procurement.
-- This migration intentionally creates durable state and does not auto-create vendors,
-- approve quotes, verify payments, certify deliverables, or grant access.
create table if not exists bridge_vendor_jobs (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references bridge_titles(id) on delete restrict,
  job_type text not null check (job_type in ('dubbing','loudness_check','imf_request','dcp_request','human_qc','subtitles_localization','audio_description','color_finishing','ott_delivery','poster_campaign')),
  status text not null default 'requested' check (status in ('requested','quoted','approved','payment_pending','paid','processing','human_review','qc_inspection','blocked','rejected','cancelled','signed_off','delivered','refund_required')),
  service_lane text not null default 'managed' check (service_lane in ('self_service','managed')),
  scope jsonb not null default '{}'::jsonb,
  source_asset_key text,
  requested_by text not null,
  assigned_vendor_id uuid,
  indicative_min_paise bigint,
  indicative_max_paise bigint,
  approved_quote_id uuid,
  payment_provider text,
  payment_order_id text,
  payment_id text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','order_created','paid','failed','refund_pending','refunded')),
  deliverable_asset_key text,
  deliverable_sha256 text,
  deliverable_metadata jsonb not null default '{}'::jsonb,
  signoff_by text,
  signoff_at timestamptz,
  delivered_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (indicative_min_paise is null or indicative_min_paise >= 0),
  check (indicative_max_paise is null or indicative_max_paise >= 0),
  check (indicative_min_paise is null or indicative_max_paise is null or indicative_max_paise >= indicative_min_paise),
  check (status <> 'delivered' or (deliverable_asset_key is not null and signoff_at is not null))
);
create index if not exists bridge_vendor_jobs_title_created_idx on bridge_vendor_jobs(title_id, created_at desc);
create index if not exists bridge_vendor_jobs_status_created_idx on bridge_vendor_jobs(status, created_at desc);
create index if not exists bridge_vendor_jobs_payment_order_idx on bridge_vendor_jobs(payment_order_id) where payment_order_id is not null;

create table if not exists bridge_vendor_service_quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references bridge_vendor_jobs(id) on delete restrict,
  vendor_name text not null,
  vendor_reference text,
  currency char(3) not null default 'INR' check (currency = 'INR'),
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array'),
  vendor_amount_paise bigint not null check (vendor_amount_paise >= 0),
  bridge_fee_paise bigint not null default 0 check (bridge_fee_paise >= 0),
  tax_amount_paise bigint not null default 0 check (tax_amount_paise >= 0),
  total_amount_paise bigint generated always as (vendor_amount_paise + bridge_fee_paise + tax_amount_paise) stored,
  scope_text text not null,
  sla_text text not null,
  expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','expired','superseded')),
  submitted_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_vendor_quotes_job_created_idx on bridge_vendor_service_quotes(job_id, created_at desc);
create unique index if not exists bridge_vendor_jobs_approved_quote_unique on bridge_vendor_jobs(approved_quote_id) where approved_quote_id is not null;
alter table bridge_vendor_jobs
  add constraint bridge_vendor_jobs_approved_quote_fk
  foreign key (approved_quote_id) references bridge_vendor_service_quotes(id) on delete restrict;

create table if not exists bridge_vendor_job_events (
  id bigserial primary key,
  job_id uuid not null references bridge_vendor_jobs(id) on delete restrict,
  actor_user_id text not null,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bridge_vendor_job_events_job_created_idx on bridge_vendor_job_events(job_id, created_at asc);

create table if not exists bridge_vendor_service_catalog (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('dubbing','loudness_check','imf_request','dcp_request','human_qc','subtitles_localization','audio_description','color_finishing','ott_delivery','poster_campaign')),
  display_name text not null,
  pricing_unit text not null,
  indicative_min_paise bigint,
  indicative_max_paise bigint,
  quote_required boolean not null default true,
  pricing_basis text not null default 'indicative_market_estimate',
  source_url text,
  active boolean not null default true,
  version integer not null default 1,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by text not null default 'migration_seed',
  created_at timestamptz not null default now(),
  check (indicative_min_paise is null or indicative_min_paise >= 0),
  check (indicative_max_paise is null or indicative_max_paise >= 0),
  check (indicative_min_paise is null or indicative_max_paise is null or indicative_max_paise >= indicative_min_paise)
);
create index if not exists bridge_vendor_catalog_active_idx on bridge_vendor_service_catalog(service_type, active, effective_from desc);

insert into bridge_vendor_service_catalog (service_type, display_name, pricing_unit, indicative_min_paise, indicative_max_paise, quote_required, source_url)
values
  ('dubbing','Dubbing','per_finished_minute',120000,600000,true,'https://justshoot.ai/blog/youtube-video-dubbing-cost-india-2026'),
  ('loudness_check','Basic loudness check + report (not a Dolby encode)','per_master',200000,850000,false,'https://tejasmedia.in/services'),
  ('human_qc','Human audio/video QC','per_master',500000,1500000,true,'https://tejasmedia.in/services'),
  ('dcp_request','DCP 2K unencrypted','per_feature_film',1000000,2000000,true,'https://swastikafilms.com/blog/film-dcp-process-costing/dcp-making-process-costing-explained-for-filmmakers-in-india/'),
  ('dcp_request','DCP 4K / encryption / KDM scope','per_package',2000000,4000000,true,'https://realtouchstudios.com/pricing'),
  ('imf_request','IMF package','per_package',1500000,5000000,true,'https://www.qlab.in/book-online')
on conflict do nothing;

-- Do not enable anonymous/public access. App-level authorization runs through
-- Bridge's verified actor + RBAC, and all mutations are performed server-side.
-- If the deployed DB uses Supabase-managed RLS for these tables, policy creation
-- must be added in the matching project after verifying existing roles/identity mapping.
