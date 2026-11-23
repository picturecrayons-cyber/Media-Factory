import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isFinishedFilmSubmission } from "./studio-title-classification";

const titlesSource = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");

test("only explicitly classified finished films appear in Studio Finished Films", () => {
  assert.equal(isFinishedFilmSubmission({ id: "film-1", submission_type: "finished_film" }), true);
  assert.equal(isFinishedFilmSubmission({ id: "concept-1", submission_type: "story_concept" }), false);
  assert.equal(isFinishedFilmSubmission({ id: "legacy-1", submission_type: null }), false);
  assert.equal(isFinishedFilmSubmission({ id: "missing-1" }), false);
  assert.equal(isFinishedFilmSubmission({ id: "linked-1", submission_type: "finished_film" }, new Set(["linked-1"])), false);
});

test("owned title query enforces server-side finished-film and concept-link exclusion", () => {
  assert.match(titlesSource, /submission_type = 'finished_film'/);
  assert.match(titlesSource, /bridge_story_concept_submissions/);
  assert.match(titlesSource, /isFinishedFilmSubmission/);
});
