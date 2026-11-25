-- Private, versioned record of the B2B policies acknowledged during signup.
-- Source-only until a separately approved STAGING migration is applied.
CREATE TABLE IF NOT EXISTS public.bridge_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_user_id text NOT NULL REFERENCES public.bridge_profiles(user_id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  client_acknowledged_at timestamptz,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'signup',
  CONSTRAINT bridge_legal_acceptances_source_check CHECK (source IN ('signup', 'account_update')),
  CONSTRAINT bridge_legal_acceptances_versions_check CHECK (
    length(terms_version) BETWEEN 1 AND 40 AND length(privacy_version) BETWEEN 1 AND 40
  ),
  CONSTRAINT bridge_legal_acceptances_user_versions_unique UNIQUE (bridge_user_id, terms_version, privacy_version)
);

CREATE INDEX IF NOT EXISTS bridge_legal_acceptances_auth_user_idx
  ON public.bridge_legal_acceptances(auth_user_id, accepted_at DESC);

ALTER TABLE public.bridge_legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bridge_legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bridge_legal_acceptances TO postgres, service_role;

COMMENT ON TABLE public.bridge_legal_acceptances IS
  'Private server-recorded acknowledgement of versioned Crayons Bridge B2B legal policies.';


-- Explicitly deny browser roles; application access is server-side only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.bridge_legal_acceptances'::regclass
      AND polname = 'deny_browser_access'
  ) THEN
    CREATE POLICY deny_browser_access ON public.bridge_legal_acceptances
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
