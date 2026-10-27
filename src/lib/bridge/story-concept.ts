/**
 * Story / Concept submission types and constants.
 * Additive module for Crayons Bridge. Feature remains disabled by default.
 */

export type SubmissionType = 'finished_film' | 'story_concept';

export type CurationStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'INTRODUCED_TO_BUYERS';

export type BuyerInterestLevel =
  | 'VIEWED'
  | 'INTERESTED'
  | 'REQUESTED_MATERIALS'
  | 'PASSED';

export const STORY_CONCEPT_ENABLED =
  process.env.STORY_CONCEPT_ENABLED === 'true';

export const STORY_CONCEPT_SERVICE_CODE = 'STORY_CONCEPT_NETWORK_SUBMISSION';

export interface StoryConceptSubmission {
  id: string;
  title_id: string;
  logline: string | null;
  synopsis: string | null;
  treatment_url: string | null;
  screenplay_url: string | null;
  genre: string[];
  estimated_budget_range: string | null;
  target_platforms: string[];
  curation_status: CurationStatus;
  admin_notes: string | null;
  introduced_to_buyers_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuyerInterest {
  id: string;
  concept_submission_id: string;
  buyer_user_id: string;
  interest_level: BuyerInterestLevel;
  notes: string | null;
  created_at: string;
}

export interface CreateStoryConceptPayload {
  logline?: string | null;
  synopsis?: string | null;
  treatment_url?: string | null;
  screenplay_url?: string | null;
  genre?: string[];
  estimated_budget_range?: string | null;
  target_platforms?: string[];
}
