-- Human-approved Bridge distribution desk. Server-only records; no outbound mail path.
create table if not exists public.bridge_distribution_inquiries (
  id uuid primary key default gen_random_uuid(),
  source_reference text not null unique,
  buyer_name text not null,
  buyer_email text not null,
  inquiry_text text not null,
  request_summary jsonb not null default '{}'::jsonb,
  title_id text references public.bridge_titles(id),
  draft_subject text not null default '',
  draft_body text not null default '',
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED','NEEDS_REVIEW','DRAFT_READY','APPROVED_DRAFT')),
  created_by text not null,
  updated_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_distribution_inquiry_email_chk check (position('@' in buyer_email) > 1)
);
create index if not exists bridge_distribution_inquiries_status_created_idx
  on public.bridge_distribution_inquiries(status, created_at desc);
create index if not exists bridge_distribution_inquiries_title_idx
  on public.bridge_distribution_inquiries(title_id, created_at desc);
alter table public.bridge_distribution_inquiries enable row level security;
-- Intentionally no client policies: access is through authenticated, permission-checked Bridge server functions only.
