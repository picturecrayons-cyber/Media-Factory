-- Creator / Studio service requests. This is a source migration only.
-- It is forward-only and uses the reconciled Testing schema contract.
-- Do not apply to hosted Testing or Production without separate approval.

CREATE TABLE IF NOT EXISTS public.bridge_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id text NOT NULL REFERENCES public.bridge_profiles(user_id) ON DELETE RESTRICT,
  requester_account_type text NOT NULL
    CONSTRAINT bridge_service_requests_requester_account_type_check
    CHECK (requester_account_type IN ('independent_creator','studio')),
  organization_id uuid REFERENCES public.bridge_organizations(id) ON DELETE RESTRICT,
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  category text NOT NULL
    CONSTRAINT bridge_service_requests_category_check
    CHECK (length(category) BETWEEN 2 AND 100),
  description text NOT NULL
    CONSTRAINT bridge_service_requests_description_check
    CHECK (length(description) BETWEEN 10 AND 4000),
  attachment_document_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'SUBMITTED'
    CONSTRAINT bridge_service_requests_status_check
    CHECK (status IN ('SUBMITTED','UNDER_REVIEW','QUOTE_READY','AWAITING_PAYMENT','PAID','ASSIGNED','IN_PROGRESS','REVIEW','COMPLETED','CANCELLED','REFUNDED')),
  quote_id uuid REFERENCES public.bridge_service_quotes(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.bridge_service_orders(id) ON DELETE RESTRICT,
  assigned_provider text,
  delivery_evidence_url text
    CONSTRAINT bridge_service_requests_delivery_evidence_url_check
    CHECK (delivery_evidence_url IS NULL OR delivery_evidence_url LIKE 'https://%'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_service_requests_account_scope CHECK (
    (requester_account_type = 'independent_creator' AND organization_id IS NULL)
    OR (requester_account_type = 'studio' AND organization_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS bridge_service_requests_owner_idx
  ON public.bridge_service_requests(requester_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bridge_service_requests_org_idx
  ON public.bridge_service_requests(organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bridge_service_requests_status_idx
  ON public.bridge_service_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bridge_service_requests_quote_uq
  ON public.bridge_service_requests(quote_id) WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bridge_service_requests_order_uq
  ON public.bridge_service_requests(order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bridge_service_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.bridge_service_requests(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_user_id text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bridge_service_request_events_request_idx
  ON public.bridge_service_request_events(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bridge_service_request_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.bridge_service_requests(id) ON DELETE RESTRICT,
  recipient_user_id text,
  organization_id uuid REFERENCES public.bridge_organizations(id) ON DELETE RESTRICT,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_service_request_notification_recipient CHECK (
    recipient_user_id IS NOT NULL OR organization_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS bridge_service_request_notifications_user_idx
  ON public.bridge_service_request_notifications(recipient_user_id, created_at DESC)
  WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bridge_service_request_notifications_org_idx
  ON public.bridge_service_request_notifications(organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.bridge_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_service_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_service_request_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bridge_service_requests, public.bridge_service_request_events,
  public.bridge_service_request_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bridge_service_requests, public.bridge_service_request_events,
  public.bridge_service_request_notifications TO postgres, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.bridge_service_requests'::regclass AND polname='deny_browser_access') THEN
    CREATE POLICY deny_browser_access ON public.bridge_service_requests FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.bridge_service_request_events'::regclass AND polname='deny_browser_access') THEN
    CREATE POLICY deny_browser_access ON public.bridge_service_request_events FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.bridge_service_request_notifications'::regclass AND polname='deny_browser_access') THEN
    CREATE POLICY deny_browser_access ON public.bridge_service_request_notifications FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- Synchronize only valid, server-verified commercial order transitions.
CREATE OR REPLACE FUNCTION public.bridge_sync_service_request_order_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  next_status text;
  previous_request_status text;
  request_row public.bridge_service_requests%ROWTYPE;
BEGIN
  next_status := CASE NEW.status
    WHEN 'PAYMENT_PENDING' THEN 'AWAITING_PAYMENT'
    WHEN 'PAID' THEN 'PAID'
    WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'REFUNDED' THEN 'REFUNDED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    ELSE NULL END;
  IF next_status IS NULL THEN RETURN NEW; END IF;

  SELECT status INTO previous_request_status
  FROM public.bridge_service_requests WHERE quote_id=NEW.quote_id FOR UPDATE;
  IF NOT FOUND OR previous_request_status=next_status THEN RETURN NEW; END IF;

  IF NOT (
    (previous_request_status='QUOTE_READY' AND next_status='AWAITING_PAYMENT') OR
    (previous_request_status='AWAITING_PAYMENT' AND next_status='PAID') OR
    (previous_request_status='ASSIGNED' AND next_status='IN_PROGRESS') OR
    (previous_request_status='REVIEW' AND next_status='COMPLETED') OR
    (next_status='REFUNDED' AND previous_request_status IN ('PAID','ASSIGNED','IN_PROGRESS','REVIEW','COMPLETED')) OR
    (next_status='CANCELLED' AND previous_request_status IN ('SUBMITTED','UNDER_REVIEW','QUOTE_READY','AWAITING_PAYMENT'))
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.bridge_service_requests
  SET status=next_status,order_id=NEW.id,
      completed_at=CASE WHEN next_status='COMPLETED' THEN COALESCE(completed_at,now()) ELSE completed_at END,
      updated_at=now()
  WHERE quote_id=NEW.quote_id
  RETURNING * INTO request_row;

  INSERT INTO public.bridge_service_request_events(request_id,from_status,to_status,note,metadata)
  VALUES(request_row.id,previous_request_status,next_status,'Commercial order state synchronized',jsonb_build_object('serviceOrderId',NEW.id,'sourceOrderStatus',NEW.status));

  INSERT INTO public.bridge_service_request_notifications(request_id,recipient_user_id,title,message)
  VALUES(request_row.id,request_row.requester_user_id,'Service request updated','Your service request is now '||replace(next_status,'_',' ')||'.');

  IF request_row.organization_id IS NOT NULL THEN
    INSERT INTO public.bridge_service_request_notifications(request_id,organization_id,title,message)
    VALUES(request_row.id,request_row.organization_id,'Studio service request updated','A Studio service request is now '||replace(next_status,'_',' ')||'.');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_reject_service_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Service request status history is immutable';
END;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_validate_service_request_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='SUBMITTED' AND NEW.status IN ('UNDER_REVIEW','QUOTE_READY','CANCELLED')) OR
    (OLD.status='UNDER_REVIEW' AND NEW.status IN ('QUOTE_READY','CANCELLED')) OR
    (OLD.status='QUOTE_READY' AND NEW.status IN ('AWAITING_PAYMENT','CANCELLED')) OR
    (OLD.status='AWAITING_PAYMENT' AND NEW.status IN ('PAID','CANCELLED')) OR
    (OLD.status='PAID' AND NEW.status IN ('ASSIGNED','REFUNDED')) OR
    (OLD.status='ASSIGNED' AND NEW.status IN ('IN_PROGRESS','REFUNDED')) OR
    (OLD.status='IN_PROGRESS' AND NEW.status IN ('REVIEW','REFUNDED')) OR
    (OLD.status='REVIEW' AND NEW.status IN ('COMPLETED','REFUNDED')) OR
    (OLD.status='COMPLETED' AND NEW.status='REFUNDED')
  ) THEN RAISE EXCEPTION 'Invalid service request transition: % -> %',OLD.status,NEW.status; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bridge_service_request_order_state_sync ON public.bridge_service_orders;
CREATE TRIGGER bridge_service_request_order_state_sync
AFTER INSERT OR UPDATE OF status ON public.bridge_service_orders
FOR EACH ROW EXECUTE FUNCTION public.bridge_sync_service_request_order_state();

DROP TRIGGER IF EXISTS bridge_service_request_events_immutable ON public.bridge_service_request_events;
CREATE TRIGGER bridge_service_request_events_immutable
BEFORE UPDATE OR DELETE ON public.bridge_service_request_events
FOR EACH ROW EXECUTE FUNCTION public.bridge_reject_service_request_event_mutation();

DROP TRIGGER IF EXISTS bridge_service_request_status_guard ON public.bridge_service_requests;
CREATE TRIGGER bridge_service_request_status_guard
BEFORE UPDATE OF status ON public.bridge_service_requests
FOR EACH ROW EXECUTE FUNCTION public.bridge_validate_service_request_status();

COMMENT ON TABLE public.bridge_service_requests IS
  'Creator and Studio service requests, separate from title submissions and buyer review.';
COMMENT ON TABLE public.bridge_service_request_events IS
  'Append-only status history for service requests.';
COMMENT ON TABLE public.bridge_service_request_notifications IS
  'Server-side notifications for service request status, quote, payment and delivery events.';
