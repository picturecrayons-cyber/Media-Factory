/**
 * Story / Concept submission types and constants.
 * Additive module for Crayons Bridge.
 */
export type SubmissionType = "finished_film" | "story_concept";
export type CurationStatus = "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "INTRODUCED_TO_BUYERS";
export type ReviewStatus = "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_INFO";
export type BuyerInterestLevel = "VIEWED" | "INTERESTED" | "REQUESTED_MATERIALS" | "PASSED";

export const STORY_CONCEPT_ENABLED = (() => {
  try {
    if (typeof process !== "undefined" && process.env?.STORY_CONCEPT_ENABLED === "true") return true;
  } catch { /* ignore */ }
  try {
    const viteEnv = (import.meta as { env?: Record<string, string> }).env;
    if (viteEnv?.VITE_STORY_CONCEPT_ENABLED === "true") return true;
  } catch { /* ignore */ }
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
  rights_holder_name?: string | null;
  rights_basis?: string | null;
  third_party_materials_included?: boolean | null;
  rights_declaration_accepted_at?: string | null;
  rights_declaration_version?: string | null;
  editorial_status?: ReviewStatus;
  editorial_reviewed_by?: string | null;
  editorial_reviewed_at?: string | null;
  editorial_review_notes?: string | null;
  legal_status?: ReviewStatus;
  legal_reviewed_by?: string | null;
  legal_reviewed_at?: string | null;
  legal_review_notes?: string | null;
  fee_certified_at?: string | null;
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

export const CURATION_TRANSITIONS: Record<CurationStatus, CurationStatus[]> = {
  PENDING: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "PENDING"],
  APPROVED: ["INTRODUCED_TO_BUYERS", "UNDER_REVIEW"],
  REJECTED: ["UNDER_REVIEW", "PENDING"],
  INTRODUCED_TO_BUYERS: [],
};

export type StoryConceptApprovalState = {
  rights_holder_name: string | null;
  rights_basis: string | null;
  rights_basis_details: string | null;
  third_party_materials_included: boolean | null;
  third_party_materials_details: string | null;
  rights_declaration_accepted_at: string | Date | null;
  editorial_status: string | null;
  editorial_reviewed_by: string | null;
  legal_status: string | null;
  legal_reviewed_by: string | null;
  fee_certified_at?: string | Date | null;
};

export function hasCompleteRightsDeclaration(state: StoryConceptApprovalState): boolean {
  return Boolean(
    state.rights_declaration_accepted_at &&
    state.rights_holder_name?.trim() &&
    state.rights_basis &&
    (state.rights_basis !== "OTHER" || Boolean(state.rights_basis_details?.trim())) &&
    state.third_party_materials_included !== null &&
    state.third_party_materials_included !== undefined &&
    (state.third_party_materials_included !== true || Boolean(state.third_party_materials_details?.trim()))
  );
}

export function hasIndependentEditorialAndLegalApproval(state: StoryConceptApprovalState): boolean {
  return state.editorial_status === "APPROVED" &&
    state.legal_status === "APPROVED" &&
    Boolean(state.editorial_reviewed_by) &&
    Boolean(state.legal_reviewed_by) &&
    state.editorial_reviewed_by !== state.legal_reviewed_by &&
    hasCompleteRightsDeclaration(state);
}

export function canIntroduceStoryConceptToBuyers(state: StoryConceptApprovalState): boolean {
  return hasIndependentEditorialAndLegalApproval(state) && Boolean(state.fee_certified_at);
}