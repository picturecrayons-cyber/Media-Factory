-- Add a controlled draft / approval / publish lifecycle to the existing homepage row.
-- This extends the existing CMS store; it does not create a second content store.
ALTER TABLE public.bridge_site_content
  ADD COLUMN IF NOT EXISTS draft_payload jsonb,
  ADD COLUMN IF NOT EXISTS published_payload jsonb,
  ADD COLUMN IF NOT EXISTS workflow_state text NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS draft_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.bridge_site_content
  ADD CONSTRAINT bridge_site_content_workflow_state_check
  CHECK (workflow_state IN ('DRAFT', 'APPROVED', 'PUBLISHED'));

UPDATE public.bridge_site_content
SET published_payload = jsonb_build_object(
  'heroTitle', hero_title,
  'heroBody', hero_body,
  'workflowHeading', workflow_heading,
  'audienceHeading', audience_heading,
  'finalCtaHeading', final_cta_heading
)
WHERE content_key = 'homepage' AND published_payload IS NULL;

CREATE TABLE IF NOT EXISTS public.bridge_site_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key text NOT NULL REFERENCES public.bridge_site_content(content_key) ON DELETE CASCADE,
  version_number integer NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'SUPERSEDED')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  UNIQUE (content_key, version_number)
);

ALTER TABLE public.bridge_site_content_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bridge_site_content_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.bridge_site_content FROM anon, authenticated;
