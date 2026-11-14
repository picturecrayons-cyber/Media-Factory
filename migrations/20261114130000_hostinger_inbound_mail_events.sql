-- Server-only metadata capture for Hostinger message.received notifications.
-- Store only mailbox/message metadata and a short preview. Never store the raw
-- webhook payload, full message body, attachment content, or authentication token.
create table if not exists private.bridge_inbound_mail_events (
  id uuid primary key default gen_random_uuid(),
  payload_sha256 char(64) not null unique
    check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  event_name text not null check (event_name = 'message.received'),
  mailbox text not null check (length(mailbox) <= 320),
  sender text not null check (length(sender) <= 320),
  subject text not null default '' check (length(subject) <= 998),
  thread_id text check (thread_id is null or length(thread_id) <= 256),
  preview text check (preview is null or length(preview) <= 1500),
  message_received_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists bridge_inbound_mail_events_received_idx
  on private.bridge_inbound_mail_events (received_at desc);

alter table private.bridge_inbound_mail_events enable row level security;
revoke all privileges on table private.bridge_inbound_mail_events from public, anon, authenticated;
grant all privileges on table private.bridge_inbound_mail_events to service_role;
