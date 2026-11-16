
ALTER TABLE public.bridge_titles
  ADD COLUMN IF NOT EXISTS merged_into_title_id TEXT REFERENCES public.bridge_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_model TEXT DEFAULT 'NEGOTIATION',
  ADD COLUMN IF NOT EXISTS min_guarantee_amount NUMERIC(12,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_bridge_titles_merged_into
  ON public.bridge_titles(merged_into_title_id)
  WHERE merged_into_title_id IS NOT NULL;

UPDATE public.loop_titles
SET status='approved', listed=true, published=true, updated_at=timezone('utc'::text, now())
WHERE slug='pranayam-1947';

CREATE TABLE IF NOT EXISTS public.bridge_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id TEXT NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  buyer_id TEXT NOT NULL REFERENCES public.bridge_profiles(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN
    ('REQUESTED','IN_REVIEW','NEGOTIATING','TERMS_AGREED','PAYMENT_PENDING','PAID','LICENSE_ACTIVE','REJECTED')),
  territories TEXT[] NOT NULL DEFAULT '{}',
  media_rights TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  window_start DATE,
  window_end DATE,
  is_exclusive BOOLEAN DEFAULT false,
  license_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  currency TEXT DEFAULT 'INR',
  deal_terms JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.bridge_deals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='bridge_deals' AND policyname='buyer_deal_isolation'
  ) THEN
    CREATE POLICY buyer_deal_isolation ON public.bridge_deals
    FOR ALL USING (
      buyer_id = auth.uid()::text OR EXISTS (
        SELECT 1 FROM public.bridge_profiles
        WHERE user_id = auth.uid()::text
          AND internal_role IN ('super_admin','admin','legal_reviewer')
      )
    );
  END IF;
END $$;
