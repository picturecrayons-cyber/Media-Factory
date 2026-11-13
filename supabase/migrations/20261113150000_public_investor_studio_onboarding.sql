-- Public Creator / Investor onboarding and canonical Studio organization scope.
-- Additive only: existing accounts, titles, assets and concept submissions are preserved.
-- All new tables remain server-only; authenticated clients receive no direct table grants.

CREATE TABLE IF NOT EXISTS public.bridge_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  normalized_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bridge_profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bridge_profiles_organization_id_fkey'
      AND conrelid = 'public.bridge_profiles'::regclass
  ) THEN
    ALTER TABLE public.bridge_profiles
      ADD CONSTRAINT bridge_profiles_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.bridge_organizations(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.bridge_organization_memberships (
  organization_id uuid NOT NULL REFERENCES public.bridge_organizations(id),
  user_id text NOT NULL REFERENCES public.bridge_profiles(user_id),
  membership_role text NOT NULL
    CHECK (membership_role IN ('owner', 'admin', 'member', 'producer', 'dit')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  created_by text NOT NULL REFERENCES public.bridge_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- Give each pre-existing Studio profile its own organization. Never merge
-- separate accounts merely because their free-text organization names match.
CREATE TEMP TABLE _bridge_studio_org_backfill ON COMMIT DROP AS
SELECT user_id, organization_name, gen_random_uuid() AS organization_id
FROM public.bridge_profiles
WHERE account_type = 'studio'
  AND organization_id IS NULL
  AND NULLIF(btrim(organization_name), '') IS NOT NULL;

INSERT INTO public.bridge_organizations (id, legal_name, normalized_name, status)
SELECT organization_id,
       organization_name,
       lower(regexp_replace(btrim(organization_name), '[[:space:]]+', ' ', 'g')) || ':' || user_id,
       'active'
FROM _bridge_studio_org_backfill;

UPDATE public.bridge_profiles p
SET organization_id = b.organization_id,
    updated_at = now()
FROM _bridge_studio_org_backfill b
WHERE p.user_id = b.user_id
  AND p.organization_id IS NULL;

INSERT INTO public.bridge_organization_memberships
  (organization_id, user_id, membership_role, status, created_by)
SELECT organization_id, user_id, 'owner', 'active', user_id
FROM _bridge_studio_org_backfill
ON CONFLICT (organization_id, user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS bridge_org_memberships_user_status_idx
  ON public.bridge_organization_memberships (user_id, status);

-- Existing story concept rows remain attached to their legacy title for audit.
-- New concepts are independently owned and do not create fake film titles.
ALTER TABLE public.bridge_story_concept_submissions
  ADD COLUMN IF NOT EXISTS title_name text,
  ADD COLUMN IF NOT EXISTS owner_user_id text,
  ADD COLUMN IF NOT EXISTS owner_organization_id uuid;

UPDATE public.bridge_story_concept_submissions c
SET title_name = COALESCE(c.title_name, t.name),
    owner_user_id = COALESCE(c.owner_user_id, t.owner_user_id),
    owner_organization_id = COALESCE(c.owner_organization_id, t.owner_organization_id)
FROM public.bridge_titles t
WHERE c.title_id = t.id
  AND (c.title_name IS NULL OR c.owner_user_id IS NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bridge_story_concept_submissions
    WHERE title_name IS NULL OR owner_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Story concept backfill incomplete; refusing to relax title_id requirement';
  END IF;
END $$;

ALTER TABLE public.bridge_story_concept_submissions
  ALTER COLUMN title_name SET NOT NULL,
  ALTER COLUMN owner_user_id SET NOT NULL,
  ALTER COLUMN title_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS bridge_story_concept_owner_created_idx
  ON public.bridge_story_concept_submissions (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bridge_story_concept_org_created_idx
  ON public.bridge_story_concept_submissions (owner_organization_id, created_at DESC)
  WHERE owner_organization_id IS NOT NULL;

-- Owner identity is always resolved through the verified Bridge↔Supabase link.
DROP POLICY IF EXISTS bridge_story_concepts_owner_select ON public.bridge_story_concept_submissions;
CREATE POLICY bridge_story_concepts_owner_select
  ON public.bridge_story_concept_submissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bridge_loop_identity_links l
    WHERE l.bridge_user_id = bridge_story_concept_submissions.owner_user_id
      AND l.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS bridge_story_concepts_owner_insert ON public.bridge_story_concept_submissions;
CREATE POLICY bridge_story_concepts_owner_insert
  ON public.bridge_story_concept_submissions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bridge_loop_identity_links l
    WHERE l.bridge_user_id = bridge_story_concept_submissions.owner_user_id
      AND l.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS bridge_story_concepts_owner_update ON public.bridge_story_concept_submissions;
CREATE POLICY bridge_story_concepts_owner_update
  ON public.bridge_story_concept_submissions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bridge_loop_identity_links l
    WHERE l.bridge_user_id = bridge_story_concept_submissions.owner_user_id
      AND l.auth_user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bridge_loop_identity_links l
    WHERE l.bridge_user_id = bridge_story_concept_submissions.owner_user_id
      AND l.auth_user_id = (SELECT auth.uid())
  ));

ALTER TABLE public.bridge_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_organization_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bridge_organizations FROM anon, authenticated;
REVOKE ALL ON public.bridge_organization_memberships FROM anon, authenticated;

COMMENT ON COLUMN public.bridge_profiles.organization_id IS
  'Server-resolved canonical Studio organization UUID; never inferred from organization_name.';
COMMENT ON COLUMN public.bridge_story_concept_submissions.title_id IS
  'Nullable legacy association only. New story concept submissions do not create or require bridge_titles records.';
