export type SubmissionRow = { id: string; submission_type?: string | null };

export function filterFinishedFilmRows<T extends SubmissionRow>(
  rows: T[],
  storyConceptTitleIds: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (row) => row.submission_type !== "story_concept" && !storyConceptTitleIds.has(row.id),
  );
}
