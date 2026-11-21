/** Canonical submission classification used by the Studio Finished Films server response. */
export function isStudioFinishedFilm(submissionType: string | null | undefined): boolean {
  return submissionType === "finished_film";
}
