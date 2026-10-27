/**
 * Server-side data access for Story / Concept submissions.
 * Additive only. Uses existing getSql() + auth patterns.
 * Feature remains gated by STORY_CONCEPT_ENABLED.
 */

import {
  STORY_CONCEPT_ENABLED,
  type CreateStoryConceptPayload,
  type CurationStatus,
  type BuyerInterestLevel,
  type StoryConceptSubmission,
  type BuyerInterest,
} from './story-concept';

// NOTE: Import getSql and auth helpers from the existing bridge patterns.
// Adjust the import paths to match the actual project structure if needed.
// import { getSql } from '@/lib/db'; // or whatever the canonical helper is
// import { requireUserId, requireAdmin } from '@/lib/auth/...';

/**
 * Create a story/concept submission linked to an existing bridge_title.
 * Also sets bridge_titles.submission_type = 'story_concept'.
 */
export async function createStoryConceptSubmission(
  titleId: string,
  payload: CreateStoryConceptPayload,
  actorUserId: string,
): Promise<StoryConceptSubmission> {
  if (!STORY_CONCEPT_ENABLED) {
    throw new Error('Story/Concept submissions are not enabled.');
  }

  // TODO: Replace with real getSql() implementation matching project conventions.
  // Example shape (pseudo):
  //
  // const sql = getSql();
  // await sql`
  //   UPDATE bridge_titles
  //   SET submission_type = 'story_concept', updated_at = now()
  //   WHERE id = ${titleId}
  // `;
  //
  // const [row] = await sql`
  //   INSERT INTO bridge_story_concept_submissions (
  //     title_id, logline, synopsis, treatment_url, screenplay_url,
  //     genre, estimated_budget_range, target_platforms
  //   ) VALUES (
  //     ${titleId},
  //     ${payload.logline ?? null},
  //     ${payload.synopsis ?? null},
  //     ${payload.treatment_url ?? null},
  //     ${payload.screenplay_url ?? null},
  //     ${payload.genre ?? []},
  //     ${payload.estimated_budget_range ?? null},
  //     ${payload.target_platforms ?? []}
  //   )
  //   RETURNING *
  // `;
  //
  // return row as StoryConceptSubmission;

  throw new Error('createStoryConceptSubmission: wire to getSql() + auth');
}

export async function getStoryConceptByTitleId(
  titleId: string,
): Promise<StoryConceptSubmission | null> {
  // TODO: implement with getSql()
  throw new Error('getStoryConceptByTitleId: wire to getSql()');
}

export async function updateCurationStatus(
  submissionId: string,
  status: CurationStatus,
  adminUserId: string,
  adminNotes?: string | null,
): Promise<StoryConceptSubmission> {
  // TODO: requireAdmin(adminUserId) then update
  throw new Error('updateCurationStatus: wire to getSql() + requireAdmin');
}

export async function introduceToBuyers(
  submissionId: string,
  adminUserId: string,
): Promise<StoryConceptSubmission> {
  // Only allowed when status is APPROVED
  // Sets curation_status = 'INTRODUCED_TO_BUYERS' and introduced_to_buyers_at = now()
  throw new Error('introduceToBuyers: wire to getSql() + requireAdmin');
}

export async function recordBuyerInterest(
  conceptSubmissionId: string,
  buyerUserId: string,
  interestLevel: BuyerInterestLevel,
  notes?: string | null,
): Promise<BuyerInterest> {
  // Admin-mediated only
  throw new Error('recordBuyerInterest: wire to getSql() + requireAdmin');
}
