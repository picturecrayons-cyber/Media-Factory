
      ALTER TABLE public.bridge_deals
        ALTER COLUMN title_id TYPE text USING title_id::text;
      ALTER TABLE public.bridge_deals
        DROP CONSTRAINT IF EXISTS bridge_deals_title_id_fkey;
      ALTER TABLE public.bridge_deals
        ADD CONSTRAINT bridge_deals_title_id_fkey
        FOREIGN KEY (title_id) REFERENCES public.bridge_titles(id) ON DELETE RESTRICT;
      ALTER TABLE public.bridge_deals
        DROP CONSTRAINT IF EXISTS bridge_deals_buyer_id_fkey;
      ALTER TABLE public.bridge_deals
        ADD CONSTRAINT bridge_deals_buyer_id_fkey
        FOREIGN KEY (buyer_id) REFERENCES public.bridge_profiles(user_id) ON DELETE RESTRICT;
      ALTER TABLE public.bridge_deals ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname='public' AND tablename='bridge_deals' AND policyname='buyer_deal_isolation'
        ) THEN
          CREATE POLICY buyer_deal_isolation ON public.bridge_deals
          FOR ALL TO authenticated
          USING (
            buyer_id = auth.uid()::text OR
            EXISTS (
              SELECT 1 FROM public.bridge_profiles
              WHERE user_id = auth.uid()::text
                AND internal_role IN ('super_admin','admin','legal_reviewer')
            )
          )
          WITH CHECK (
            buyer_id = auth.uid()::text OR
            EXISTS (
              SELECT 1 FROM public.bridge_profiles
              WHERE user_id = auth.uid()::text
                AND internal_role IN ('super_admin','admin','legal_reviewer')
            )
          );
        END IF;
      END $$;
    