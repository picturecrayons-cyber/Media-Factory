CREATE TABLE public.bridge_loop_identity_links (
  bridge_user_id text PRIMARY KEY
    REFERENCES public.bridge_profiles(user_id)
    ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL UNIQUE
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bridge_loop_identity_links
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
  ON TABLE public.bridge_loop_identity_links
  FROM PUBLIC, anon, authenticated;