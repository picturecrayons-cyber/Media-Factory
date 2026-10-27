/**
 * Story / Concept submission types and constants.
 * Additive module for Crayons Bridge.
 */

export type SubmissionType = "finished_film" | "story_concept";

export type CurationStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "INTRODUCED_TO_BUYERS";

export type BuyerInterestLevel =
  | "VIEWED"
  | "INTERESTED"
  | "REQUESTED_MATERIALS"
  | "PASSED";

/** Client-safe + server-safe feature flag. */
export const STORY_CONCEPT_ENABLED = (() => {
  try {
    if (typeof process !== "undefined" && process.env?.STORY_CONCEPT_ENABLED === "true") {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const viteEnv = (import.meta as { env?: Record<string, string> }).env;
    if (viteEnv?.VITE_STORY_CONCEPT_ENABLED === "true") return true;
  } catch {
    /* ignore */
  }
  return false;
})();

export const STORY_CONCEPT_SERVICE_CODE = "STORY_CONCEPT_NETWORK_SUBMISSION";

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

/** Allowed admin curation transitions. */
export const CURATION_TRANSITIONS: Record<CurationStatus, CurationStatus[]> = {
  PENDING: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "PENDING"],
  APPROVED: ["INTRODUCED_TO_BUYERS", "UNDER_REVIEW"],
  REJECTED: ["UNDER_REVIEW", "PENDING"],
  INTRODUCED_TO_BUYERS: [],
};
