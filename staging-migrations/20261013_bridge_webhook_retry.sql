-- Crayons Bridge staging-only webhook retry schema alignment.
-- This file is intentionally outside the root migrations/ directory so the
-- production deploy-time migrator cannot apply it automatically.
-- Apply manually ONLY to the isolated crayons-bridge-staging project after review.
-- Never run against canonical Production.

begin;

do $$
begin
  if to_regclass('public.bridge_webhook_events') is null then
    raise exception 'Blocked: public.bridge_webhook_events does not exist in this staging database';
  end if;
end
$$;

alter table public.bridge_webhook_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token text,
  add column if not exists attempts integer not null default 0;

commit;
