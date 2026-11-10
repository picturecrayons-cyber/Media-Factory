ALTER TABLE public.bridge_webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_token text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bridge_webhook_events.processing_started_at IS
  'Start time of the current webhook processing lease; stale leases may be reclaimed.';
COMMENT ON COLUMN public.bridge_webhook_events.processing_token IS
  'Random token fencing completion/failure updates to the current webhook lease owner.';
COMMENT ON COLUMN public.bridge_webhook_events.attempts IS
  'Number of processing lease claims attempted for this webhook event.';

CREATE UNIQUE INDEX IF NOT EXISTS bridge_payments_provider_payment_id_unique_idx
  ON public.bridge_payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;