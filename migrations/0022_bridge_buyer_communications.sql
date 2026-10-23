-- Persistent Bridge buyer CRM and communication ledger.
-- Additive only. Do not apply automatically; review and apply on isolated staging only.
-- No email is sent by this schema or by creating an outbox row.

create table if not exists public.bridge_buyer_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(trim(company_name)) > 0),
  normalized_company_name text not null,
  company_domain text,
  normalized_domain text,
  contact_name text,
  contact_email text,
  normalized_contact_email text,
  country text,
  source text not null default 'MANUAL',
  pipeline_stage text not null default 'DISCOVERED'
    check (pipeline_stage in ('DISCOVERED','RESEARCHING','CONTACT_READY','ENQUIRY','IN_NEGOTIATION','CONTRACT_REVIEW','CONTRACTED','DECLINED','DORMANT')),
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in ('UNVERIFIED','IDENTITY_REVIEW','VERIFIED_BUYER','CONTRACTED_PARTNER','REJECTED')),
  verification_evidence_ref text,
  owner_user_id text not null,
  organization_scope text,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_email is null or length(trim(contact_email)) > 0),
  check (company_domain is null or length(trim(company_domain)) > 0)
);
create unique index if not exists bridge_buyer_prospects_domain_uidx
  on public.bridge_buyer_prospects(normalized_domain) where normalized_domain is not null and normalized_domain <> '';
create index if not exists bridge_buyer_prospects_stage_idx
  on public.bridge_buyer_prospects(pipeline_stage, updated_at desc);
create index if not exists bridge_buyer_prospects_email_idx
  on public.bridge_buyer_prospects(normalized_contact_email) where normalized_contact_email is not null;

create table if not exists public.bridge_communication_threads (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.bridge_buyer_prospects(id) on delete restrict,
  organization_scope text not null,
  title_id text references public.bridge_titles(id) on delete restrict,
  deal_reference text,
  subject text not null check (length(trim(subject)) > 0),
  channel text not null default 'HOSTINGER_MAIL'
    check (channel in ('HOSTINGER_MAIL','BRIDGE_INTERNAL','OTHER')),
  external_thread_id text,
  mailbox_account_ref text,
  access_scope text not null default 'INTERNAL'
    check (access_scope in ('INTERNAL','ORGANIZATION','DEAL_PARTICIPANTS')),
  created_by text not null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel <> 'HOSTINGER_MAIL' or external_thread_id is not null)
);
create unique index if not exists bridge_communication_external_thread_uidx
  on public.bridge_communication_threads(channel, mailbox_account_ref, external_thread_id)
  where external_thread_id is not null;
create index if not exists bridge_communication_scope_activity_idx
  on public.bridge_communication_threads(organization_scope, last_activity_at desc);

create table if not exists public.bridge_communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.bridge_communication_threads(id) on delete restrict,
  direction text not null check (direction in ('INBOUND','OUTBOUND','INTERNAL_NOTE')),
  sender_ref text,
  recipient_refs jsonb not null default '[]'::jsonb,
  subject text,
  body_text text,
  external_message_id text,
  sent_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (direction <> 'OUTBOUND' or (external_message_id is not null and sent_at is not null))
);
create unique index if not exists bridge_communication_external_message_uidx
  on public.bridge_communication_messages(external_message_id) where external_message_id is not null;
create index if not exists bridge_communication_messages_thread_idx
  on public.bridge_communication_messages(thread_id, created_at desc);

create table if not exists public.bridge_mail_outbox (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.bridge_communication_threads(id) on delete restrict,
  idempotency_key text not null,
  recipient_refs jsonb not null check (jsonb_typeof(recipient_refs) = 'array' and jsonb_array_length(recipient_refs) > 0),
  subject text not null check (length(trim(subject)) > 0),
  body_text text not null check (length(trim(body_text)) > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','AWAITING_CONFIRMATION','CONFIRMED','SENDING','SENT','FAILED','CANCELLED')),
  prepared_by text not null,
  prepared_at timestamptz not null default now(),
  confirmed_by text,
  confirmed_at timestamptz,
  send_attempt_id text,
  sent_external_message_id text,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(idempotency_key),
  check (status not in ('CONFIRMED','SENDING','SENT') or (confirmed_by is not null and confirmed_at is not null)),
  check (status <> 'SENT' or (sent_external_message_id is not null and sent_at is not null))
);
create index if not exists bridge_mail_outbox_pending_idx on public.bridge_mail_outbox(status, created_at);

create table if not exists public.bridge_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id text not null,
  organization_scope text,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bridge_notifications_recipient_idx
  on public.bridge_notifications(recipient_user_id, created_at desc);

alter table public.bridge_buyer_prospects enable row level security;
alter table public.bridge_communication_threads enable row level security;
alter table public.bridge_communication_messages enable row level security;
alter table public.bridge_mail_outbox enable row level security;
alter table public.bridge_notifications enable row level security;

revoke all on public.bridge_buyer_prospects from anon, authenticated;
revoke all on public.bridge_communication_threads from anon, authenticated;
revoke all on public.bridge_communication_messages from anon, authenticated;
revoke all on public.bridge_mail_outbox from anon, authenticated;
revoke all on public.bridge_notifications from anon, authenticated;

comment on table public.bridge_buyer_prospects is 'Private CRM prospect registry. Unverified prospects are not buyer accounts or contracted partners.';
comment on table public.bridge_communication_threads is 'Private, scope-bound communication thread links; external mailbox credentials remain in secret management.';
comment on table public.bridge_mail_outbox is 'Draft and explicit-confirmation outbox. Insert/update never sends mail by itself.';
comment on table public.bridge_notifications is 'Deduplicated persisted notification ledger. Emit only from actual state transitions.';
