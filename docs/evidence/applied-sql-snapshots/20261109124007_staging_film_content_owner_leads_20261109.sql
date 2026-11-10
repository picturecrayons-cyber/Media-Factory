
create table if not exists bridge_private.film_content_owner_leads (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  contact_name text,
  contact_email text not null,
  film_titles text[] not null default '{}',
  catalogue_summary text,
  lead_priority text not null default 'FOLLOW_UP'
    check (lead_priority in ('A','B','FOLLOW_UP','RESEARCH')),
  rights_status text not null default 'NOT_VERIFIED'
    check (rights_status in ('NOT_VERIFIED','PARTIAL_EVIDENCE','VERIFIED','REJECTED','DISPUTED')),
  contact_status text not null default 'NOT_CONTACTED'
    check (contact_status in ('NOT_CONTACTED','FOLLOW_UP_REQUIRED','REPLIED','INVITATION_DRAFTED','INVITED','ONBOARDED','CLOSED')),
  source_period text,
  evidence_summary text,
  next_action text,
  source_mailbox text not null default 'abijithasokan@crayonspictures.com',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_email)
);

alter table bridge_private.film_content_owner_leads enable row level security;
revoke all on bridge_private.film_content_owner_leads from public, anon, authenticated;
grant select, insert, update, delete on bridge_private.film_content_owner_leads to service_role;
comment on table bridge_private.film_content_owner_leads is
'Internal Crayons LOOP film acquisition prospect list. Rights are unverified until documentary legal review is completed. Not exposed to public Data API.';
