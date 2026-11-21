import assert from "node:assert/strict";
import test from "node:test";
import { isStudioFinishedFilm } from "./studio-title-classification.ts";

test("Studio Finished Films includes only authoritative finished_film submissions", () => {
  assert.equal(isStudioFinishedFilm("finished_film"), true);
  assert.equal(isStudioFinishedFilm("story_concept"), false);
  assert.equal(isStudioFinishedFilm("other"), false);
  assert.equal(isStudioFinishedFilm(null), false);
  assert.equal(isStudioFinishedFilm(undefined), false);
});

test("one story_concept title cannot be classified into the Finished Films result", () => {
  const rows = [
    { id: "film-1", submission_type: "finished_film" },
    { id: "concept-1", submission_type: "story_concept" },
    { id: "film-2", submission_type: "finished_film" },
  ];
  const finished = rows.filter((row) => isStudioFinishedFilm(row.submission_type));
  const concepts = rows.filter((row) => row.submission_type === "story_concept");
  assert.deepEqual(finished.map((row) => row.id), ["film-1", "film-2"]);
  assert.deepEqual(concepts.map((row) => row.id), ["concept-1"]);
  assert.equal(finished.some((film) => concepts.some((concept) => concept.id === film.id)), false);
});
