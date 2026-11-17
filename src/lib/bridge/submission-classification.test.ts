import test from "node:test";
import assert from "node:assert/strict";
import { filterFinishedFilmRows } from "./submission-classification.ts";

test("finished-film lists exclude explicitly classified Story / Concept rows", () => {
  const rows = [
    { id: "film-1", submission_type: "finished_film" },
    { id: "concept-1", submission_type: "story_concept" },
  ];
  assert.deepEqual(filterFinishedFilmRows(rows, new Set()), [rows[0]]);
});

test("finished-film lists exclude legacy concept rows linked through the concept table", () => {
  const rows = [
    { id: "film-1", submission_type: "finished_film" },
    { id: "legacy-concept", submission_type: "finished_film" },
    { id: "unclassified-film", submission_type: null },
  ];
  assert.deepEqual(
    filterFinishedFilmRows(rows, new Set(["legacy-concept"])),
    [rows[0], rows[2]],
  );
});

test("normal finished-film rows remain visible when the optional concept table is absent", () => {
  const rows = [
    { id: "film-1", submission_type: "finished_film" },
    { id: "film-2", submission_type: null },
  ];
  assert.deepEqual(filterFinishedFilmRows(rows, new Set()), rows);
});
