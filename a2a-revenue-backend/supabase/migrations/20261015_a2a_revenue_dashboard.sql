-- A2A Revenue Dashboard schema for Supabase PostgreSQL.
-- Review and apply only to the verified target Supabase project.
-- No Firebase or SQLite dependencies.
begin;
create table if not exists public.a2a_revenue_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null unique,
  stage text not null default 'Outreach Sent'
    check (stage in ('Outreach Sent', 'Awaiting Reply', 'Call Scheduled', 'Proposal Sent', 'Paid Won', 'Lost')),
  target_amount numeric(14,2) not null default 0 check (target_amount >= 0),
  target_currency text not null default 'USD' check (target_currency in ('USD', 'INR', 'EUR', 'GBP')),
  agent text not null,
  notes text not null default '',
  sent_verified boolean not null default false,
  sent_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.a2a_execution_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('lead_updated', 'operator_note', 'mail_check', 'mail_sent', 'ai_request', 'payment_verified', 'agent_action')),
  agent text not null,
  message text not null check (char_length(message) between 1 and 2000),
  evidence_status text not null default 'operator_note'
    check (evidence_status in ('operator_note', 'recorded', 'verified', 'failed', 'pending'))
);
alter table public.a2a_revenue_leads enable row level security;
alter table public.a2a_execution_logs enable row level security;
revoke all on table public.a2a_revenue_leads from anon, authenticated;
revoke all on table public.a2a_execution_logs from anon, authenticated;
create index if not exists a2a_revenue_leads_stage_idx on public.a2a_revenue_leads(stage);
create index if not exists a2a_execution_logs_created_at_idx on public.a2a_execution_logs(created_at desc);
-- Target amounts are pipeline targets, never realized revenue. Verify sent-state evidence separately.
insert into public.a2a_revenue_leads
  (name, contact, stage, target_amount, target_currency, agent, notes, sent_verified)
values
  ('Shivam Shukla', 'shivamshukla1428@gmail.com', 'Outreach Sent', 2500, 'USD', '@agent.research', 'Film distribution follow-up reported sent; verify against Hostinger Sent evidence.', false),
  ('Swarnali Entertainment', 'swarnalientertainment.social@gmail.com', 'Outreach Sent', 5000, 'USD', '@agent.editor', 'Aprokashito rights and licensing outreach reported sent; verify against Hostinger Sent evidence.', false),
  ('Allrites', 'contact@allrites.com', 'Outreach Sent', 3500, 'USD', '@agent.orchestrator', 'Independent-film catalogue partnership outreach reported sent; verify against Hostinger Sent evidence.', false),
  ('Watcho Fliqs', 'fliqs@watcho.com', 'Outreach Sent', 4000, 'USD', '@agent.research', 'Content onboarding outreach reported sent; verify against Hostinger Sent evidence.', false),
  ('Exotic Production', 'exoticproduction2020@gmail.com', 'Outreach Sent', 1500, 'USD', '@agent.geo', 'Film rights readiness outreach reported sent; verify against Hostinger Sent evidence.', false)
on conflict (contact) do nothing;
commit;
