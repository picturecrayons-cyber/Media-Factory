export const FINISHED_FILM_SUBMISSION_TYPE = "finished_film" as const;
export const STORY_CONCEPT_SUBMISSION_TYPE = "story_concept" as const;

export type SubmissionType = typeof FINISHED_FILM_SUBMISSION_TYPE | typeof STORY_CONCEPT_SUBMISSION_TYPE;

/** Exact-match guard: NULL, unknown and differently-cased values fail closed. */
export function hasSubmissionType(value: unknown, expected: SubmissionType): boolean {
  return value === expected;
}
