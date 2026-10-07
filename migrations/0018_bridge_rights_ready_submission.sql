-- Rights-ready public submission intake for Crayons Bridge.
-- One canonical bridge_title remains the authority; this table stores submission metadata only.

create table if not exists public.bridge_title_submission_intake (
  title_id text primary key references public.bridge_titles(id) on delete cascade,
  authority_type text not null check (authority_type in (
    'RIGHTS_OWNER',
    'PRODUCER',
    'AUTHORIZED_REPRESENTATIVE',
    'DISTRIBUTOR_SALES_AGENT',
    'LICENSEE_WITH_ONWARD_RIGHTS',
    'OTHER'
  )),
  authorization_evidence_type text not null check (authorization_evidence_type in (
    'RIGHTS_AGREEMENT',
    'CHAIN_OF_TITLE',
    'AUTHORIZATION_LETTER',
    'DISTRIBUTION_AGREEMENT',
    'OTHER'
  )),
  authorization_confirmed boolean not null default false,
  buyer_channels jsonb not null default '[]'::jsonb,
  screener_mode text not null default 'NONE' check (screener_mode in (
    'NONE',
    'PRIVATE_BRIDGE',
    'SECURE_EXTERNAL'
  )),
  screener_url text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_submission_screener_url_chk check (
    (screener_mode = 'SECURE_EXTERNAL' and screener_url is not null)
    or (screener_mode <> 'SECURE_EXTERNAL')
  )
);

create index if not exists bridge_title_submission_intake_updated_idx
  on public.bridge_title_submission_intake(updated_at desc);

alter table public.bridge_title_submission_intake enable row level security;
