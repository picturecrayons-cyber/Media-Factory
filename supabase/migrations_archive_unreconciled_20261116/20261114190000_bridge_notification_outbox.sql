-- Durable, deduplicated email notifications for Bridge business events.
create table if not exists public.bridge_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient_email text not null,
  subject text not null,
  text_body text not null,
  html_body text,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'sent') = (sent_at is not null))
);
create index if not exists bridge_notification_outbox_dispatch_idx
  on public.bridge_notification_outbox(status, next_attempt_at, created_at);
alter table public.bridge_notification_outbox enable row level security;
revoke all privileges on table public.bridge_notification_outbox from public, anon, authenticated;
