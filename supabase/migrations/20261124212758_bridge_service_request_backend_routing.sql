-- Backend owns service execution by default; approval decisions are routed separately.
-- assigned_provider remains the external/vendor provider field.
--
-- This service-request schema currently exists in Testing but not in the
-- Production baseline. Apply routing only where the complete table exists;
-- do not manufacture a partial Production table to satisfy migration replay.
DO $migration$
BEGIN
  IF to_regclass('public.bridge_service_requests') IS NULL THEN
    RAISE NOTICE 'Skipping service-request routing: public.bridge_service_requests is not installed in this environment';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.bridge_service_requests
    ADD COLUMN IF NOT EXISTS assigned_team text NOT NULL DEFAULT ''backend'',
    ADD COLUMN IF NOT EXISTS decision_required boolean NOT NULL DEFAULT false';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bridge_service_requests_assigned_team_check'
      AND conrelid = to_regclass('public.bridge_service_requests')
  ) THEN
    EXECUTE 'ALTER TABLE public.bridge_service_requests
      ADD CONSTRAINT bridge_service_requests_assigned_team_check
      CHECK (assigned_team IN (''backend'', ''decision_queue''))';
  END IF;

  EXECUTE $function$
    CREATE OR REPLACE FUNCTION public.bridge_route_service_request_team()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $body$
    BEGIN
      -- Human decision checkpoints stay in a restricted decision queue.
      -- All other request lifecycle work is owned by backend services.
      IF NEW.status IN ('UNDER_REVIEW', 'QUOTE_READY', 'REVIEW') THEN
        NEW.assigned_team := 'decision_queue';
        NEW.decision_required := true;
      ELSE
        NEW.assigned_team := 'backend';
        NEW.decision_required := false;
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$;

  EXECUTE 'DROP TRIGGER IF EXISTS bridge_service_request_team_routing ON public.bridge_service_requests';
  EXECUTE 'CREATE TRIGGER bridge_service_request_team_routing
    BEFORE INSERT OR UPDATE OF status ON public.bridge_service_requests
    FOR EACH ROW EXECUTE FUNCTION public.bridge_route_service_request_team()';
  EXECUTE 'CREATE INDEX IF NOT EXISTS bridge_service_requests_team_queue_idx
    ON public.bridge_service_requests (assigned_team, decision_required, status, created_at DESC)';
  EXECUTE $comment$
    COMMENT ON COLUMN public.bridge_service_requests.assigned_team IS
      'Internal execution ownership: backend for automated processing; decision_queue for authorized human decisions.'
  $comment$;
  EXECUTE $comment$
    COMMENT ON COLUMN public.bridge_service_requests.decision_required IS
      'True only at explicit human decision checkpoints; not a request for Super Admin to perform backend execution.'
  $comment$;
END
$migration$;
