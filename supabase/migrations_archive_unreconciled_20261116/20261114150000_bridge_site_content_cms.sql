-- CMS homepage content storage.
-- Forward-only additive migration. Public clients must not read/write this table;
-- the application serves public homepage content through its server-side getter.
CREATE TABLE IF NOT EXISTS public.bridge_site_content (
  content_key text PRIMARY KEY,
  hero_title text NOT NULL,
  hero_body text NOT NULL,
  workflow_heading text NOT NULL,
  audience_heading text NOT NULL,
  final_cta_heading text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bridge_site_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bridge_site_content FROM anon, authenticated;

INSERT INTO public.bridge_site_content (
  content_key, hero_title, hero_body, workflow_heading, audience_heading, final_cta_heading
) VALUES (
  'homepage',
  'One bridge from content to market.',
  'The professional workspace for preparing, protecting, licensing and delivering film and television.',
  'From upload to delivery.',
  'Built for the media business.',
  'Ready to move your content forward?'
)
ON CONFLICT (content_key) DO NOTHING;
