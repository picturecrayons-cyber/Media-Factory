-- Keep Story Concept row access governed by its existing RLS policies.
-- Remove table-level capabilities that RLS cannot constrain (notably TRUNCATE).
-- This migration also replays in clean databases where the optional Story
-- Concept table has not been installed yet; the Production table is present.
do $$
begin
  if to_regclass('public.bridge_story_concept_submissions') is not null then
    revoke truncate, references, trigger
      on table public.bridge_story_concept_submissions
      from anon, authenticated;
  end if;
end $$;
