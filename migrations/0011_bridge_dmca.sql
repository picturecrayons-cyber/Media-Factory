-- DMCA registration state for Crayons Bridge.
-- No DMCA credentials or passwords are stored here.
-- External registration is performed server-side against api.dmca.com.

create table if not exists bridge_dmca_registrations (
  id text primary key,
  user_id text not null,
  email text not null,
  company_name text not null,
  dmca_account_id text,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_dmca_registrations_user_idx
  on bridge_dmca_registrations (user_id, created_at desc);

create index if not exists bridge_dmca_registrations_email_idx
  on bridge_dmca_registrations (lower(email));
