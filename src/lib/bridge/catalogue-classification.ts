export type CatalogueRecordClassification = {
  record_classification?: string | null;
  submission_type?: string | null;
  external_ids?: Record<string, unknown> | null;
};

/** Records visible in the Finished Film catalogue; Story / Concept has its own desk. */
export function isFinishedFilmCatalogueRecord(record: CatalogueRecordClassification): boolean {
  return record.record_classification !== "TEST" &&
    record.submission_type !== "story_concept" &&
    record.external_ids?.test_only !== true &&
    record.external_ids?.test_only !== "true";
}
