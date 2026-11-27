import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isFinishedFilmCatalogueRecord } from "./catalogue-classification.ts";

describe("Finished Film catalogue classification", () => {
  it("excludes Story / Concept submissions even when content_type is OTHER", () => {
    assert.equal(isFinishedFilmCatalogueRecord({ submission_type: "story_concept" }), false);
  });

  it("excludes records explicitly classified as test", () => {
    assert.equal(isFinishedFilmCatalogueRecord({ record_classification: "TEST" }), false);
  });

  it("excludes external test-only fixtures", () => {
    assert.equal(isFinishedFilmCatalogueRecord({ external_ids: { test_only: true } }), false);
    assert.equal(isFinishedFilmCatalogueRecord({ external_ids: { test_only: "true" } }), false);
  });

  it("keeps ordinary finished-film records in the catalogue", () => {
    assert.equal(isFinishedFilmCatalogueRecord({
      submission_type: "finished_film",
      record_classification: "UNCLASSIFIED",
      external_ids: {},
    }), true);
  });
});
