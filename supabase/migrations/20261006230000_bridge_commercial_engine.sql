-- CRAYONS BRIDGE commercial engine
-- Canonical service/cost taxonomy + quote/order/invoice ledger.
-- No hard-coded customer prices are seeded. Finance must configure rates before checkout.
-- This migration is intentionally server-side; Better Auth + RBAC remains the application identity boundary.

create table if not exists public.bridge_service_catalog (
  code text primary key,
  category text not null,
  name text not null,
  description text not null default '',
  why text not null default '',
  classification text not null check (classification in ('BILLABLE','INCLUDED','INTERNAL','PASS_THROUGH')),
  pricing_method text not null check (pricing_method in (
    'FIXED','PER_FINISHED_MINUTE','PER_LANGUAGE','PER_DESTINATION','PER_ASSET',
    'PER_GB','PER_HOUR','PER_REVISION','PER_TRANSACTION','PASS_THROUGH','CUSTOM_QUOTE'
  )),
  unit_label text not null default 'title',
  customer_visible boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bridge_service_rates (
  id uuid primary key default gen_random_uuid(),
  service_code text not null references public.bridge_service_catalog(code),
  version integer not null,
  currency text not null default 'INR',
  base_price_paise integer,
  minimum_price_paise integer,
  active boolean not null default false,
  source text not null default 'ADMIN_CONFIG',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  constraint bridge_service_rates_price_chk check (
    (base_price_paise is null or base_price_paise >= 0)
    and (minimum_price_paise is null or minimum_price_paise >= 0)
  ),
  constraint bridge_service_rates_version_uq unique (service_code, version)
);
create index if not exists bridge_service_rates_active_idx
  on public.bridge_service_rates(service_code, active, effective_from desc);

create table if not exists public.bridge_tax_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'INR',
  rate_percent numeric(6,3) not null check (rate_percent >= 0 and rate_percent <= 100),
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.bridge_service_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  user_id text not null,
  title_id text not null references public.bridge_titles(id),
  status text not null check (status in ('DRAFT','QUOTED','ACCEPTED','PAYMENT_PENDING','PAID','IN_PROGRESS','COMPLETED','EXPIRED','CANCELLED')),
  runtime_minutes integer,
  selected_destinations jsonb not null default '[]'::jsonb,
  detected_assets jsonb not null default '[]'::jsonb,
  required_work jsonb not null default '[]'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  subtotal_paise integer not null check (subtotal_paise >= 0),
  tax_paise integer not null check (tax_paise >= 0),
  total_paise integer not null check (total_paise >= 0),
  currency text not null default 'INR',
  accepted_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_service_quotes_user_idx on public.bridge_service_quotes(user_id, created_at desc);
create index if not exists bridge_service_quotes_title_idx on public.bridge_service_quotes(title_id, created_at desc);

create table if not exists public.bridge_service_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.bridge_service_quotes(id) on delete cascade,
  service_code text not null references public.bridge_service_catalog(code),
  rate_id uuid references public.bridge_service_rates(id),
  classification text not null check (classification in ('BILLABLE','INCLUDED','INTERNAL','PASS_THROUGH')),
  pricing_method text not null,
  unit_label text not null,
  quantity numeric(14,3) not null check (quantity >= 0),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  line_total_paise integer not null check (line_total_paise >= 0),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bridge_service_quote_lines_quote_idx on public.bridge_service_quote_lines(quote_id);

create table if not exists public.bridge_service_orders (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.bridge_service_quotes(id),
  user_id text not null,
  title_id text not null references public.bridge_titles(id),
  payment_id text references public.bridge_payments(id),
  status text not null check (status in ('PAYMENT_PENDING','PAID','IN_PROGRESS','COMPLETED','CANCELLED','REFUNDED')),
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null default 'INR',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_service_orders_user_idx on public.bridge_service_orders(user_id, created_at desc);
create index if not exists bridge_service_orders_title_idx on public.bridge_service_orders(title_id, created_at desc);

create table if not exists public.bridge_service_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.bridge_service_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists bridge_service_order_events_order_idx on public.bridge_service_order_events(order_id, created_at);

create table if not exists public.bridge_service_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.bridge_service_orders(id),
  invoice_number text not null unique,
  status text not null check (status in ('ISSUED','PAID','VOID','REFUNDED')),
  subtotal_paise integer not null check (subtotal_paise >= 0),
  tax_paise integer not null check (tax_paise >= 0),
  total_paise integer not null check (total_paise >= 0),
  currency text not null default 'INR',
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bridge_financial_ledger (
  id uuid primary key default gen_random_uuid(),
  title_id text references public.bridge_titles(id),
  service_order_id uuid references public.bridge_service_orders(id),
  payment_id text references public.bridge_payments(id),
  entry_type text not null check (entry_type in ('REVENUE','INTERNAL_COST','PASS_THROUGH','TAX','PAYMENT_FEE','REFUND','CHARGEBACK','SETTLEMENT')),
  classification text not null check (classification in ('BILLABLE','INCLUDED','INTERNAL','PASS_THROUGH')),
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bridge_financial_ledger_title_idx on public.bridge_financial_ledger(title_id, created_at desc);
create index if not exists bridge_financial_ledger_order_idx on public.bridge_financial_ledger(service_order_id, created_at desc);

alter table public.bridge_service_catalog enable row level security;
alter table public.bridge_service_rates enable row level security;
alter table public.bridge_tax_rates enable row level security;
alter table public.bridge_service_quotes enable row level security;
alter table public.bridge_service_quote_lines enable row level security;
alter table public.bridge_service_orders enable row level security;
alter table public.bridge_service_order_events enable row level security;
alter table public.bridge_service_invoices enable row level security;
alter table public.bridge_financial_ledger enable row level security;

-- Server-only data access: Better Auth + RBAC. Do not create auth.uid() policies here.

insert into public.bridge_service_catalog
(code,category,name,description,why,classification,pricing_method,unit_label,customer_visible,active)
values
('INGEST_UPLOAD','INGEST','Ingest / Upload Handling','Content upload and ingest handling','Move source media into the controlled Bridge ingest workflow.','BILLABLE','FIXED','title',true,true),
('INGEST_TRANSFER','INGEST','Large-file Transfer','Large media transfer handling','Transfer large source files reliably.','BILLABLE','PER_GB','GB',true,true),
('INGEST_ASSIST','INGEST','Upload Support / Assisted Ingest','Operator-assisted ingest','Support creators who need assisted upload handling.','BILLABLE','FIXED','title',true,true),

('PREP_METADATA','PREPARATION','Metadata Preparation','Prepare title metadata for delivery.','Make title information complete and usable downstream.','BILLABLE','FIXED','title',true,true),
('PREP_ARTWORK','PREPARATION','Artwork / Poster Preparation','Prepare delivery artwork.','Make artwork ready for destination requirements.','BILLABLE','PER_ASSET','asset',true,true),
('PREP_SUBTITLE','PREPARATION','Subtitle Preparation','Prepare supplied subtitle assets.','Correct or prepare subtitle assets already supplied.','BILLABLE','PER_LANGUAGE','language',true,true),
('PREP_CAPTION','PREPARATION','Caption Preparation','Prepare captions.','Create a usable caption deliverable.','BILLABLE','PER_FINISHED_MINUTE','finished minute',true,true),
('PREP_AUDIO','PREPARATION','Audio Preparation','Prepare supplied audio assets.','Make audio suitable for delivery.','BILLABLE','FIXED','title',true,true),
('PREP_TRAILER','PREPARATION','Trailer / Promo Asset Preparation','Prepare trailer or promotional assets.','Create a destination-ready promo asset.','BILLABLE','PER_ASSET','asset',true,true),
('PREP_CONFORMANCE','PREPARATION','Content Conformance Preparation','Prepare content to a stated conformance target.','Resolve content conformance gaps before mastering.','BILLABLE','CUSTOM_QUOTE','title',true,true),

('MASTER_VIDEO','MASTERING','Video Mastering','Prepare a professional video master.','Create a delivery-ready video master.','BILLABLE','FIXED','title',true,true),
('MASTER_AUDIO','MASTERING','Audio Mastering','Prepare a professional audio master.','Create a delivery-ready audio master.','BILLABLE','FIXED','title',true,true),
('MASTER_SUBTITLE','MASTERING','Subtitle / Caption Mastering','Prepare subtitle/caption masters.','Create compliant timed-text masters.','BILLABLE','PER_LANGUAGE','language',true,true),
('MASTER_OTT','MASTERING','OTT Master Creation','Create an OTT master.','Prepare a destination-ready OTT master.','BILLABLE','PER_DESTINATION','destination',true,true),
('MASTER_BROADCAST','MASTERING','Broadcast Master Creation','Create a broadcast master.','Prepare a broadcaster-ready master.','BILLABLE','PER_DESTINATION','destination',true,true),
('MASTER_IMF','MASTERING','IMF / Mezzanine Master','Create IMF or mezzanine deliverables.','Provide a high-quality intermediate package.','BILLABLE','CUSTOM_QUOTE','title',true,true),
('MASTER_TRANSCODE','MASTERING','Format Conversion / Transcoding','Transcode media to a required format.','Produce the exact delivery format required.','BILLABLE','PER_HOUR','processing hour',true,true),

('QC_VIDEO','QC','Video QC','Inspect video integrity and technical issues.','Reduce delivery rejection risk.','BILLABLE','FIXED','title',true,true),
('QC_AUDIO','QC','Audio QC','Inspect audio integrity and technical issues.','Reduce audio-related rejection risk.','BILLABLE','FIXED','title',true,true),
('QC_SUBTITLE','QC','Subtitle QC','Inspect subtitle/caption compliance.','Reduce timed-text rejection risk.','BILLABLE','PER_LANGUAGE','language',true,true),
('QC_METADATA','QC','Metadata QC','Inspect metadata completeness.','Reduce metadata rejection risk.','BILLABLE','FIXED','title',true,true),
('QC_TECHNICAL','QC','Technical QC','Inspect technical readiness before delivery.','Verify the title is technically ready.','BILLABLE','FIXED','title',true,true),
('QC_PLATFORM','QC','Platform Compliance QC','Check a title against a destination specification.','Reduce platform rejection risk.','BILLABLE','PER_DESTINATION','destination',true,true),
('QC_DELIVERY','QC','Delivery QC','Validate the assembled delivery package.','Catch delivery package problems before handoff.','BILLABLE','PER_DESTINATION','destination',true,true),
('QC_RECHECK','QC','Re-QC / Correction QC','Recheck corrected content.','Verify remediation after a failed QC.','BILLABLE','PER_REVISION','revision',true,true),

('RIGHTS_VERIFY','RIGHTS_LEGAL','Rights Verification','Review stated exploitation rights.','Establish whether the title can be used for the planned destination.','BILLABLE','CUSTOM_QUOTE','title',true,true),
('RIGHTS_COT','RIGHTS_LEGAL','Chain-of-Title Review','Review chain-of-title evidence.','Reduce legal and ownership risk.','BILLABLE','CUSTOM_QUOTE','title',true,true),
('RIGHTS_TERRITORY','RIGHTS_LEGAL','Territory Clearance','Review territory permissions.','Confirm destination territory coverage.','BILLABLE','PER_DESTINATION','territory',true,true),
('RIGHTS_WINDOW','RIGHTS_LEGAL','Window Clearance','Review exploitation window.','Confirm the planned window is permitted.','BILLABLE','CUSTOM_QUOTE','title',true,true),
('RIGHTS_EXCLUSIVITY','RIGHTS_LEGAL','Exclusivity Review','Review exclusivity constraints.','Prevent conflicting exploitation commitments.','BILLABLE','CUSTOM_QUOTE','title',true,true),
('RIGHTS_DOCS','RIGHTS_LEGAL','Legal Document Processing','Process legal/rightsholder documents.','Turn legal documents into an operational clearance record.','BILLABLE','CUSTOM_QUOTE','case',true,true),
('RIGHTS_REREVIEW','RIGHTS_LEGAL','Rights Correction / Re-review','Re-review corrected rights evidence.','Confirm remediation after a rights issue.','BILLABLE','PER_REVISION','revision',true,true),

('PKG_OTT','PACKAGING','OTT Packaging','Assemble destination-ready OTT package.','Prepare a title for OTT delivery.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_METADATA','PACKAGING','Platform-specific Metadata','Adapt metadata for a destination.','Meet destination metadata requirements.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_ARTWORK','PACKAGING','Platform-specific Artwork','Adapt artwork for a destination.','Meet destination artwork requirements.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_AUDIO','PACKAGING','Platform-specific Audio','Prepare destination-specific audio.','Meet destination audio requirements.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_SUBTITLE','PACKAGING','Platform-specific Subtitle','Prepare destination-specific subtitles.','Meet destination timed-text requirements.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_TRAILER','PACKAGING','Platform-specific Trailer','Prepare destination-specific promo assets.','Meet destination trailer requirements.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_DELIVERY','PACKAGING','Platform Delivery Package','Generate a complete delivery package.','Create the actual destination handoff bundle.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_APP','PACKAGING','App-specific Package','Generate an app-specific package.','Prepare the title for a specific app/channel.','BILLABLE','PER_DESTINATION','destination',true,true),
('PKG_STORE','PACKAGING','Store / Marketplace Package','Generate a store-specific package.','Prepare the title for store submission.','BILLABLE','PER_DESTINATION','destination',true,true),

('LOC_SUBTITLE_TRANSLATION','LOCALIZATION','Subtitle Translation','Translate subtitles.','Make the title available in another language.','BILLABLE','PER_FINISHED_MINUTE','finished minute',true,true),
('LOC_SUBTITLE_TIMING','LOCALIZATION','Subtitle Timing','Time subtitles.','Make translated or supplied subtitles playback-ready.','BILLABLE','PER_FINISHED_MINUTE','finished minute',true,true),
('LOC_DUBBING','LOCALIZATION','Dubbing','Create a dubbed language track.','Expand the title to another language market.','BILLABLE','PER_FINISHED_MINUTE','finished minute',true,true),
('LOC_DUB_MASTER','LOCALIZATION','Dub Mastering','Master a dubbed audio track.','Prepare the dub for delivery.','BILLABLE','PER_FINISHED_MINUTE','finished minute',true,true),
('LOC_DUB_QC','LOCALIZATION','Dub QC','QC a dubbed track.','Reduce localization rejection risk.','BILLABLE','PER_FINISHED_MINUTE','finished minute',true,true),
('LOC_ARTWORK','LOCALIZATION','Localized Artwork','Localize artwork.','Make promotional artwork market-appropriate.','BILLABLE','PER_LANGUAGE','language',true,true),
('LOC_METADATA','LOCALIZATION','Localized Metadata','Localize title metadata.','Make metadata usable in another language market.','BILLABLE','PER_LANGUAGE','language',true,true),

('DELIVERY_BUYER','DISTRIBUTION','Buyer Delivery','Secure delivery to a buyer.','Complete an authorized buyer handoff.','BILLABLE','PER_DESTINATION','destination',true,true),
('DELIVERY_OTT','DISTRIBUTION','OTT Delivery','Deliver an approved OTT package.','Complete an authorized OTT handoff.','BILLABLE','PER_DESTINATION','destination',true,true),
('DELIVERY_MULTI','DISTRIBUTION','Multi-platform Delivery','Deliver to multiple destinations.','Execute coordinated delivery across destinations.','BILLABLE','PER_DESTINATION','destination',true,true),
('DELIVERY_BROADCAST','DISTRIBUTION','Broadcaster Delivery','Deliver to a broadcaster.','Complete a broadcaster handoff.','BILLABLE','PER_DESTINATION','destination',true,true),
('DELIVERY_THEATRICAL','DISTRIBUTION','Digital / Theatrical Package Delivery','Deliver a digital/theatrical package.','Complete an authorized theatrical/digital handoff.','BILLABLE','PER_DESTINATION','destination',true,true),
('DELIVERY_RESEND','DISTRIBUTION','Delivery Re-send','Re-send an accepted package.','Recover from an operational re-send need.','BILLABLE','PER_TRANSACTION','delivery',true,true),
('DELIVERY_CORRECTION','DISTRIBUTION','Delivery Correction','Correct a delivery package.','Resolve delivery-stage errors.','BILLABLE','PER_REVISION','revision',true,true),

('STORAGE_MASTER','STORAGE','Master Storage','Store approved master media.','Keep valuable masters controlled and recoverable.','BILLABLE','PER_GB','GB-month',true,true),
('STORAGE_PROXY','STORAGE','Proxy Storage','Store proxy media.','Keep lightweight review media available.','BILLABLE','PER_GB','GB-month',true,true),
('STORAGE_ARTWORK','STORAGE','Artwork Storage','Store approved artwork.','Keep artwork available for future delivery.','BILLABLE','PER_GB','GB-month',true,true),
('STORAGE_SUBTITLE','STORAGE','Subtitle Storage','Store subtitle assets.','Keep timed-text assets available.','BILLABLE','PER_GB','GB-month',true,true),
('STORAGE_ARCHIVE','STORAGE','Archive Storage','Long-term archive storage.','Preserve delivery assets over time.','BILLABLE','PER_GB','GB-month',true,true),
('STORAGE_BACKUP','STORAGE','Backup / Redundancy','Maintain backup copies.','Protect against media loss.','BILLABLE','PER_GB','GB-month',true,true),
('STORAGE_RETENTION','STORAGE','Long-term Retention','Retain assets beyond active delivery.','Keep approved assets accessible after delivery.','BILLABLE','PER_GB','GB-month',true,true),
('STORAGE_EGRESS','STORAGE','Data Transfer / Egress','Transfer stored media out.','Support controlled downstream delivery.','PASS_THROUGH','PER_GB','GB',true,true),
('INFRA_CDN','INFRASTRUCTURE','CDN / Bandwidth','Third-party content delivery cost.','Serve media reliably to destinations.','PASS_THROUGH','PER_GB','GB',false,true),
('INFRA_TRANSCODE','INFRASTRUCTURE','Transcoding / Compute','Compute cost for processing.','Run media processing workloads.','INTERNAL','PER_HOUR','compute hour',false,true),
('INFRA_AWS','INFRASTRUCTURE','AWS / S3','Legacy compatibility or vendor storage cost.','Track legacy/vendor storage economics.','INTERNAL','PER_GB','GB-month',false,true),
('INFRA_VERCEL','INFRASTRUCTURE','Vercel','Application hosting cost.','Track application infrastructure economics.','INTERNAL','PER_MONTH','month',false,true),
('INFRA_SUPABASE','INFRASTRUCTURE','Supabase','Database/platform cost.','Track application infrastructure economics.','INTERNAL','PER_MONTH','month',false,true),
('INFRA_EMAIL','INFRASTRUCTURE','Email / SMTP','Transactional email infrastructure cost.','Operate transactional communication.','INTERNAL','PER_TRANSACTION','message',false,true),
('INFRA_DNS','INFRASTRUCTURE','Domain / DNS','Domain and DNS infrastructure.','Operate canonical production domains.','INTERNAL','PER_MONTH','month',false,true),
('INFRA_OPS','INFRASTRUCTURE','Monitoring / Operational Infrastructure','Operational tooling cost.','Keep the service reliable.','INTERNAL','PER_MONTH','month',false,true),

('PAYMENT_GATEWAY','PAYMENT','Payment Gateway Fee','External payment processing cost.','Record the true cost of collecting revenue.','PASS_THROUGH','PER_TRANSACTION','transaction',false,true),
('PAYMENT_RAZORPAY','PAYMENT','Razorpay Processing Fee','Razorpay processing cost.','Record payment economics.','PASS_THROUGH','PER_TRANSACTION','transaction',false,true),
('PAYMENT_REFUND','PAYMENT','Refund Processing','Cost incurred on refunds.','Track refund economics.','INTERNAL','PER_TRANSACTION','refund',false,true),
('PAYMENT_CHARGEBACK','PAYMENT','Chargeback Cost','Cost incurred on chargebacks.','Track chargeback economics.','INTERNAL','PER_TRANSACTION','chargeback',false,true),
('PAYMENT_PAYOUT','PAYMENT','Payout Processing','Cost of payout processing.','Track settlement economics.','INTERNAL','PER_TRANSACTION','payout',false,true),

('COMM_LICENSE','COMMERCIAL','License Fee','Contractual license consideration.','Record commercial licensing revenue.','BILLABLE','CUSTOM_QUOTE','deal',false,true),
('COMM_FIXED_LICENSE','COMMERCIAL','Fixed License Fee','Fixed contractual license consideration.','Record fixed licensing revenue.','BILLABLE','CUSTOM_QUOTE','deal',false,true),
('COMM_MG','COMMERCIAL','Minimum Guarantee','Guaranteed contractual consideration.','Track guaranteed commercial value.','BILLABLE','CUSTOM_QUOTE','deal',false,true),
('COMM_REV_SHARE','COMMERCIAL','Revenue Share','Contractual revenue participation.','Track revenue-share economics.','BILLABLE','PER_TRANSACTION','transaction',false,true),
('COMM_HYBRID','COMMERCIAL','Hybrid Commercial Fee','Hybrid contractual consideration.','Track combined fee/revenue-share economics.','BILLABLE','CUSTOM_QUOTE','deal',false,true),
('COMM_DISTRIBUTION','COMMERCIAL','Distribution Fee','Contractual distribution fee.','Record distribution revenue.','BILLABLE','CUSTOM_QUOTE','deal',false,true),
('COMM_PLATFORM','COMMERCIAL','Platform Fee','Contractual platform fee.','Record platform revenue.','BILLABLE','CUSTOM_QUOTE','deal',false,true),
('COMM_SERVICE','COMMERCIAL','Service / Preparation Fee','Customer-facing service revenue.','Record operational service revenue.','BILLABLE','CUSTOM_QUOTE','order',true,true),
('COMM_PACKAGING','COMMERCIAL','Packaging Fee','Customer-facing packaging revenue.','Record packaging revenue.','BILLABLE','CUSTOM_QUOTE','order',true,true),

('SETTLE_CREATOR','SETTLEMENT','Creator / Rights-holder Share','Contractual settlement allocation.','Calculate contractual payout.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_INVESTOR','SETTLEMENT','Investor Share','Contractual settlement allocation.','Calculate contractual payout.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_DISTRIBUTOR','SETTLEMENT','Distributor Share','Contractual settlement allocation.','Calculate contractual payout.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_PARTNER','SETTLEMENT','Partner Share','Contractual settlement allocation.','Calculate contractual payout.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_BRIDGE','SETTLEMENT','Bridge Share','Bridge retained share.','Calculate retained economics after obligations.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_PAYABLE','SETTLEMENT','Amount Payable','Outstanding contractual amount.','Track payable balances.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_PAID','SETTLEMENT','Amount Paid','Settled contractual amount.','Track paid balances.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_PENDING','SETTLEMENT','Amount Pending','Pending contractual amount.','Track pending balances.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('SETTLE_HOLD','SETTLEMENT','Amount On Hold','Held contractual amount.','Track amounts awaiting clearance.','INTERNAL','PER_TRANSACTION','transaction',false,true),

('TAX_GST','TAX','GST','Goods and Services Tax.','Track statutory tax.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('TAX_TDS','TAX','TDS / Withholding','Tax withheld at source.','Track statutory withholding.','INTERNAL','PER_TRANSACTION','transaction',false,true),
('TAX_OTHER','TAX','Other Applicable Statutory Deductions','Other statutory deductions.','Track applicable deductions.','INTERNAL','PER_TRANSACTION','transaction',false,true),

('DELIVERY_PRIORITY','DELIVERY_HANDLING','Priority Delivery','Priority turnaround handling.','Offer a faster controlled delivery path.','BILLABLE','FIXED','delivery',true,true),
('DELIVERY_MONITOR','DELIVERY_HANDLING','Delivery Monitoring','Delivery monitoring and status handling.','Give visibility through delivery.','BILLABLE','PER_DESTINATION','destination',true,true),
('DELIVERY_FAILED','DELIVERY_HANDLING','Failed-delivery Handling','Recovery from failed delivery.','Recover a failed operational handoff.','BILLABLE','PER_TRANSACTION','delivery',true,true),
('DELIVERY_SUPPORT','DELIVERY_HANDLING','Delivery Support','Operational delivery support.','Resolve delivery-stage support needs.','BILLABLE','PER_HOUR','support hour',true,true),

('PLATFORM_LOOP','PLATFORM_APP','LOOP Platform Fee','Contractually applicable LOOP platform fee.','Record platform economics when applicable.','PASS_THROUGH','CUSTOM_QUOTE','deal',false,true),
('PLATFORM_CONSUMER_PAYMENT','PLATFORM_APP','Consumer Payment Processing','Consumer payment processing cost.','Record downstream consumer payment economics.','PASS_THROUGH','PER_TRANSACTION','transaction',false,true),
('PLATFORM_APP_STORE','PLATFORM_APP','App / Store Fees','Third-party app/store fee.','Record destination marketplace economics.','PASS_THROUGH','PER_TRANSACTION','transaction',false,true),
('PLATFORM_PLAYBACK','PLATFORM_APP','CDN / Playback Delivery','Playback delivery infrastructure.','Record downstream playback delivery economics.','PASS_THROUGH','PER_GB','GB',false,true)
on conflict (code) do update set
  category=excluded.category,
  name=excluded.name,
  description=excluded.description,
  why=excluded.why,
  classification=excluded.classification,
  pricing_method=excluded.pricing_method,
  unit_label=excluded.unit_label,
  customer_visible=excluded.customer_visible,
  active=excluded.active,
  updated_at=now();

-- Tax/rates are deliberately not activated because no final CRAYONS rate card was supplied.
-- Finance must create versioned bridge_service_rates + bridge_tax_rates before checkout can be used.

create or replace function public.bridge_service_margin_paise(
  p_service_order_id uuid
) returns bigint
language sql
stable
as $$
  select
    coalesce(sum(case when entry_type='REVENUE' then amount_paise else 0 end),0)
    - coalesce(sum(case when entry_type in ('INTERNAL_COST','PASS_THROUGH','TAX','PAYMENT_FEE','REFUND','CHARGEBACK','SETTLEMENT') then amount_paise else 0 end),0)
  from public.bridge_financial_ledger
  where service_order_id = p_service_order_id;
$$;
