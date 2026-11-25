export type StudioTitleClassificationRow = {
  id: string;
  submission_type?: string | null;
};

/** Only explicitly classified finished films may appear in the Studio Finished Films list. */
export function isFinishedFilmSubmission(
  row: StudioTitleClassificationRow,
  storyConceptTitleIds: ReadonlySet<string> = new Set<string>(),
): boolean {
  return row.submission_type === "finished_film" && !storyConceptTitleIds.has(row.id);
}
