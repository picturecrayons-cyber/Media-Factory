-- Partner CRM. Additive. Do not seed.

create table if not exists bridge_partners (
  id text primary key,
  kind text not null,
  status text not null default 'pending',
  organization_id text,
  invited_email text not null,
  display_name text not null default '',
  invited_by text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_partners_kind_chk check (kind in (
    'creator','studio','buyer','distributor','platform','brand','agency','broadcaster','other'
  )),
  constraint bridge_partners_status_chk check (status in (
    'pending','verification_required','under_review','approved','rejected','suspended','archived'
  ))
);

create index if not exists bridge_partners_email_idx on bridge_partners (invited_email);
create index if not exists bridge_partners_status_idx on bridge_partners (status, updated_at desc);
