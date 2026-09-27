-- StreamVista Media OS lives in the canonical Bridge database.
-- This migration creates empty operational tables; historical exports are never seeded.
create table if not exists streamvista_orders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  service text not null check (service in ('dubbing','localization','accessibility','finishing','delivery_qc','marketing')),
  lane text not null check (lane in ('self_service','managed')),
  status text not null default 'requested' check (status in
    ('requested','quoted','payment_pending','paid','processing','human_review','qc_inspection','approved','delivered','cancelled')),
  source_s3_key text,
  output_s3_key text,
  bridge_title_id text references bridge_titles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint streamvista_output_after_qc check (output_s3_key is null or status in ('approved','delivered'))
);
create index if not exists streamvista_orders_owner_idx on streamvista_orders(owner_user_id, created_at desc);
create index if not exists streamvista_orders_bridge_idx on streamvista_orders(bridge_title_id) where bridge_title_id is not null;

create table if not exists streamvista_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references streamvista_orders(id) on delete restrict,
  step text not null,
  status text not null default 'queued' check (status in ('queued','running','needs_review','passed','failed')),
  reviewer_user_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint streamvista_review_pair check ((reviewer_user_id is null) = (reviewed_at is null))
);
create index if not exists streamvista_jobs_order_idx on streamvista_jobs(order_id);

-- References to historical records are for reconciliation, never proof of identity,
-- rights, asset existence, or a settled payment.
create table if not exists streamvista_legacy_links (
  source_table text not null check (source_table in
    ('accounts_user','films_film','films_filmdraft','films_filmbuyermapping','films_payment','films_status','films_viewhistory')),
  legacy_id text not null,
  order_id uuid references streamvista_orders(id) on delete restrict,
  bridge_title_id text references bridge_titles(id) on delete restrict,
  review_status text not null default 'pending' check (review_status in ('pending','verified','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  primary key (source_table, legacy_id),
  constraint streamvista_link_target check (order_id is not null or bridge_title_id is not null),
  constraint streamvista_link_review check (review_status <> 'verified' or (reviewed_by is not null and reviewed_at is not null))
);

alter table streamvista_orders enable row level security;
alter table streamvista_jobs enable row level security;
alter table streamvista_legacy_links enable row level security;
-- No browser roles are granted access. Server access must check Supabase identity
-- and Bridge RBAC before using a privileged database connection.
revoke all on streamvista_orders, streamvista_jobs, streamvista_legacy_links from anon, authenticated;
