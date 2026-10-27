-- Creator and studio ask. The desk decides. Nothing is priced or started here.
create table if not exists public.bridge_service_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  kind text not null check (kind in ('transcode', 'compliance', 'vault')),
  note text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'working', 'done', 'declined')),
  admin_note text not null default '',
  decided_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_service_requests_owner_idx
  on public.bridge_service_requests(owner_user_id, created_at desc);
create index if not exists bridge_service_requests_status_idx
  on public.bridge_service_requests(status, created_at desc);

alter table public.bridge_service_requests enable row level security;
revoke all on public.bridge_service_requests from anon, authenticated;
