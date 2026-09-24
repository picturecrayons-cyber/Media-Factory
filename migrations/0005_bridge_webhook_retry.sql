-- Keep a durable lease for Razorpay webhook retries. Apply to the canonical Bridge database only.
alter table bridge_webhook_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists attempts integer not null default 0;
