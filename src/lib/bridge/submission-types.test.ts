import assert from "node:assert/strict";
import test from "node:test";
import { FINISHED_FILM_SUBMISSION_TYPE, STORY_CONCEPT_SUBMISSION_TYPE, hasSubmissionType } from "./submission-types.ts";

test("finished-film classification requires an exact finished_film value", () => {
  assert.equal(hasSubmissionType("finished_film", FINISHED_FILM_SUBMISSION_TYPE), true);
  for (const value of ["story_concept", null, undefined, "legacy", "FINISHED_FILM"]) assert.equal(hasSubmissionType(value, FINISHED_FILM_SUBMISSION_TYPE), false);
});

test("story-concept classification requires an exact story_concept value", () => {
  assert.equal(hasSubmissionType("story_concept", STORY_CONCEPT_SUBMISSION_TYPE), true);
  for (const value of ["finished_film", null, undefined, "unknown"]) assert.equal(hasSubmissionType(value, STORY_CONCEPT_SUBMISSION_TYPE), false);
});
