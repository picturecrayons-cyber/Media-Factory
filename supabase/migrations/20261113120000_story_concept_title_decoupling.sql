-- Story concepts are submissions in their own workflow, not film titles.
-- Existing rows retain title_id for backward compatibility and audit history.
-- No existing title or asset rows are deleted or rewritten.

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

ALTER TABLE public.bridge_story_concept_submissions
  ALTER COLUMN title_name SET NOT NULL,
  ALTER COLUMN owner_user_id SET NOT NULL,
  ALTER COLUMN title_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS bridge_story_concept_owner_created_idx
  ON public.bridge_story_concept_submissions (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bridge_story_concept_org_created_idx
  ON public.bridge_story_concept_submissions (owner_organization_id, created_at DESC)
  WHERE owner_organization_id IS NOT NULL;

COMMENT ON COLUMN public.bridge_story_concept_submissions.title_id IS
  'Nullable legacy association only. New story concept submissions do not create or require bridge_titles records.';
