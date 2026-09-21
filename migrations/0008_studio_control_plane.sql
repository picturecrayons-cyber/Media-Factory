-- Studio Deal Room. Additive. Canonical Supabase uakpqqardziifcwzvgfx only.
-- Do not seed deals, revenue, or buyers.

create table if not exists bridge_deals (
  id text primary key,
  title_id text not null references bridge_titles (id) on delete cascade,
  organization_id text,
  licensee text not null default '',
  right_type text not null default '',
  territory text not null default '',
  language text not null default '',
  platform text not null default '',
  format text not null default '',
  term_note text not null default '',
  exclusive boolean not null default false,
  license_fee_paise int not null default 0,
  revenue_share_bps int,
  minimum_guarantee_paise int not null default 0,
  start_date date,
  end_date date,
  status text not null default 'opportunity',
  notes text not null default '',
  actor_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_deals_status_chk check (status in (
    'opportunity','proposal','negotiation','terms_agreed','contract',
    'payment','rights_activated','delivery','settlement','closed'
  ))
);

create index if not exists bridge_deals_title_idx on bridge_deals (title_id, updated_at desc);
create index if not exists bridge_deals_org_idx on bridge_deals (organization_id);
