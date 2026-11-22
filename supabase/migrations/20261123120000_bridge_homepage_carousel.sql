-- Add a bounded, public-display-only homepage carousel managed by Super Admin.
-- Source migration only: apply to STAGING after explicit migration approval; never to Production here.
ALTER TABLE public.bridge_site_content
  ADD COLUMN IF NOT EXISTS carousel_slides jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bridge_site_content_carousel_slides_array_check'
      AND conrelid = 'public.bridge_site_content'::regclass
  ) THEN
    ALTER TABLE public.bridge_site_content
      ADD CONSTRAINT bridge_site_content_carousel_slides_array_check
      CHECK (jsonb_typeof(carousel_slides) = 'array' AND jsonb_array_length(carousel_slides) <= 5);
  END IF;
END $$;

COMMENT ON COLUMN public.bridge_site_content.carousel_slides IS
  'Up to five public homepage carousel slides; each item stores an HTTPS image URL, alt text and caption.';
