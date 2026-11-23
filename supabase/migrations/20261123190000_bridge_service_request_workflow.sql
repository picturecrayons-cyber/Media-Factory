-- Creator / Studio service requests are separate from title submissions and buyer review.
-- Source-only until separately approved for STAGING. Never apply to Production here.
CREATE TABLE IF NOT EXISTS public.bridge_service_requests (
  id uuid PRIMARY KEY,
  requester_user_id text NOT NULL REFERENCES public.bridge_profiles(user_id) ON DELETE RESTRICT,
  requester_account_type text NOT NULL CHECK (requester_account_type IN ('independent_creator','studio')),
  organization_id uuid,
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (length(category) BETWEEN 2 AND 100),
  description text NOT NULL CHECK (length(description) BETWEEN 10 AND 4000),
  attachment_document_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
    'SUBMITTED','UNDER_REVIEW','QUOTE_READY','AWAITING_PAYMENT','PAID',
    'ASSIGNED','IN_PROGRESS','REVIEW','COMPLETED','CANCELLED','REFUNDED'
  )),
  quote_id uuid REFERENCES public.bridge_service_quotes(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.bridge_service_orders(id) ON DELETE RESTRICT,
  assigned_provider text,
  delivery_evidence_url text,
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
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.bridge_service_requests(id) ON DELETE CASCADE,
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
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.bridge_service_requests(id) ON DELETE CASCADE,
  recipient_user_id text,
  organization_id uuid,
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

CREATE POLICY "deny_client_access" ON public.bridge_service_requests
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny_client_access" ON public.bridge_service_request_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny_client_access" ON public.bridge_service_request_notifications
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Keep the customer request lifecycle synchronized with the existing,
-- server-verified commercial order lifecycle. Payment capture/refund continues
-- to be verified by the existing Razorpay server integration and webhook.
CREATE OR REPLACE FUNCTION public.bridge_sync_service_request_order_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_status text;
  request_row public.bridge_service_requests%ROWTYPE;
BEGIN
  IF NEW.status = 'PAYMENT_PENDING' THEN
    next_status := 'AWAITING_PAYMENT';
  ELSIF NEW.status = 'PAID' THEN
    next_status := 'PAID';
  ELSIF NEW.status = 'IN_PROGRESS' THEN
    next_status := 'IN_PROGRESS';
  ELSIF NEW.status = 'COMPLETED' THEN
    next_status := 'COMPLETED';
  ELSIF NEW.status = 'REFUNDED' THEN
    next_status := 'REFUNDED';
  ELSIF NEW.status = 'CANCELLED' THEN
    next_status := 'CANCELLED';
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.bridge_service_requests
  SET status = next_status,
      order_id = NEW.id,
      completed_at = CASE WHEN next_status = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END,
      updated_at = now()
  WHERE quote_id = NEW.quote_id
    AND status IS DISTINCT FROM next_status
  RETURNING * INTO request_row;

  IF FOUND THEN
    INSERT INTO public.bridge_service_request_events
      (id, request_id, from_status, to_status, actor_user_id, note, metadata)
    VALUES
      (gen_random_uuid(), request_row.id,
       CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
       next_status, NULL, 'Commercial order state synchronized',
       jsonb_build_object('serviceOrderId', NEW.id));

    INSERT INTO public.bridge_service_request_notifications
      (id, request_id, recipient_user_id, title, message)
    VALUES
      (gen_random_uuid(), request_row.id, request_row.requester_user_id,
       'Service request updated', 'Your service request is now ' || replace(next_status, '_', ' ') || '.');

    IF request_row.organization_id IS NOT NULL THEN
      INSERT INTO public.bridge_service_request_notifications
        (id, request_id, organization_id, title, message)
      VALUES
        (gen_random_uuid(), request_row.id, request_row.organization_id,
         'Studio service request updated', 'A service request in your Studio organization is now ' || replace(next_status, '_', ' ') || '.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bridge_service_request_order_state_sync ON public.bridge_service_orders;
CREATE TRIGGER bridge_service_request_order_state_sync
AFTER INSERT OR UPDATE OF status ON public.bridge_service_orders
FOR EACH ROW EXECUTE FUNCTION public.bridge_sync_service_request_order_state();

COMMENT ON TABLE public.bridge_service_requests IS
  'Creator and Studio service requests. Separate from title submissions, buyer review and licensing workflows.';
COMMENT ON TABLE public.bridge_service_request_notifications IS
  'In-app notifications for service request status, quote, payment and delivery events.';


-- Status history is append-only; callers cannot rewrite or erase audit events.
CREATE OR REPLACE FUNCTION public.bridge_reject_service_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Service request status history is immutable';
END;
$$;

DROP TRIGGER IF EXISTS bridge_service_request_events_immutable ON public.bridge_service_request_events;
CREATE TRIGGER bridge_service_request_events_immutable
BEFORE UPDATE OR DELETE ON public.bridge_service_request_events
FOR EACH ROW EXECUTE FUNCTION public.bridge_reject_service_request_event_mutation();

-- Story Concept review history and requester notifications are kept separate
-- from finished-film title events and the service-request notification stream.
CREATE TABLE IF NOT EXISTS public.bridge_story_concept_review_events (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL,
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_user_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bridge_story_concept_review_events_concept_idx
  ON public.bridge_story_concept_review_events(concept_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bridge_story_concept_notifications (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL,
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  recipient_user_id text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bridge_story_concept_notifications_user_idx
  ON public.bridge_story_concept_notifications(recipient_user_id, created_at DESC);

ALTER TABLE public.bridge_story_concept_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_story_concept_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bridge_story_concept_review_events, public.bridge_story_concept_notifications
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bridge_story_concept_review_events, public.bridge_story_concept_notifications
  TO postgres, service_role;
CREATE POLICY "deny_client_access" ON public.bridge_story_concept_review_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny_client_access" ON public.bridge_story_concept_notifications
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);


-- Status changes are a server-controlled state machine; clients cannot skip
-- quote acceptance, verified payment, assignment, work and delivery review.
CREATE OR REPLACE FUNCTION public.bridge_validate_service_request_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'SUBMITTED' AND NEW.status IN ('UNDER_REVIEW','QUOTE_READY','CANCELLED')) OR
    (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('QUOTE_READY','CANCELLED')) OR
    (OLD.status = 'QUOTE_READY' AND NEW.status IN ('AWAITING_PAYMENT','CANCELLED')) OR
    (OLD.status = 'AWAITING_PAYMENT' AND NEW.status IN ('PAID','CANCELLED')) OR
    (OLD.status = 'PAID' AND NEW.status IN ('ASSIGNED','REFUNDED')) OR
    (OLD.status = 'ASSIGNED' AND NEW.status IN ('IN_PROGRESS','REFUNDED')) OR
    (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('REVIEW','REFUNDED')) OR
    (OLD.status = 'REVIEW' AND NEW.status IN ('COMPLETED','REFUNDED')) OR
    (OLD.status = 'COMPLETED' AND NEW.status = 'REFUNDED')
  ) THEN
    RAISE EXCEPTION 'Invalid service request transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bridge_service_request_status_guard ON public.bridge_service_requests;
CREATE TRIGGER bridge_service_request_status_guard
BEFORE UPDATE OF status ON public.bridge_service_requests
FOR EACH ROW EXECUTE FUNCTION public.bridge_validate_service_request_status();

