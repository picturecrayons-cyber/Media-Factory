import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterFinishedFilmRows } from "./submission-classification.ts";

describe("Finished Film / Story Concept separation", () => {
  it("excludes explicitly tagged Story / Concept rows", () => {
    const rows = [
      { id: "film-1", submission_type: "finished_film" },
      { id: "concept-1", submission_type: "story_concept" },
    ];
    assert.deepEqual(filterFinishedFilmRows(rows, new Set()), [rows[0]]);
  });

  it("excludes legacy concept titles even when the discriminator defaulted to finished_film", () => {
    const rows = [
      { id: "legacy-film", submission_type: "finished_film" },
      { id: "legacy-concept", submission_type: "finished_film" },
      { id: "unclassified-film", submission_type: null },
    ];
    assert.deepEqual(filterFinishedFilmRows(rows, new Set(["legacy-concept"])), [rows[0], rows[2]]);
  });

  it("preserves normal Finished Film rows when the concept table is unavailable", () => {
    const rows = [
      { id: "film-1", submission_type: "finished_film" },
      { id: "film-2", submission_type: null },
    ];
    assert.deepEqual(filterFinishedFilmRows(rows, new Set()), rows);
  });
});
