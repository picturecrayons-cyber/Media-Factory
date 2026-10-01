-- CRA-120 Bridge Marketplace V1
create table if not exists public.bridge_license_requests (
  id text primary key,
  title_id text not null references public.bridge_titles(id) on delete cascade,
  buyer_user_id text not null,
  territory text not null,
  language text not null,
  platform text not null,
  window_label text not null,
  exclusivity text not null default 'NON_EXCLUSIVE' check (exclusivity in ('EXCLUSIVE','NON_EXCLUSIVE')),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','IN_REVIEW','APPROVED','DECLINED','CONTRACTING','PAID','DELIVERED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_license_requests_title_idx on public.bridge_license_requests(title_id);
create index if not exists bridge_license_requests_buyer_idx on public.bridge_license_requests(buyer_user_id);
alter table public.bridge_license_requests enable row level security;
