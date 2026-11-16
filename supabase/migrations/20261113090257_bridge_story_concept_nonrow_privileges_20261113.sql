-- Keep Story Concept row access governed by its existing RLS policies.
-- Remove table-level capabilities that RLS cannot constrain (notably TRUNCATE).
revoke truncate, references, trigger
  on table public.bridge_story_concept_submissions
  from anon, authenticated;
