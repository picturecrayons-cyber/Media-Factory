create table if not exists public.legacy_creator_intake (
    legacy_user_id integer primary key,
    email text not null unique,
    display_name text not null,
    source_user_type text,
    source_subcategory text,
    profile_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists legacy_creator_intake_email_idx on public.legacy_creator_intake(lower(email));
  alter table public.legacy_creator_intake enable row level security;