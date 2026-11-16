
      ALTER TABLE public.bridge_titles
        ADD COLUMN IF NOT EXISTS merged_into_title_id UUID REFERENCES public.bridge_titles(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS commercial_model TEXT DEFAULT 'NEGOTIATION',
        ADD COLUMN IF NOT EXISTS min_guarantee_amount NUMERIC(12,2) DEFAULT 0.00;
      CREATE INDEX IF NOT EXISTS idx_bridge_titles_merged_into
        ON public.bridge_titles(merged_into_title_id)
        WHERE merged_into_title_id IS NOT NULL;
    