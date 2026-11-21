import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCreatorTitleCanBeSoftDeleted,
  assertCreatorTitleCanSubmit,
} from "./creator-title-lifecycle.ts";

const validMetadata = {
  name: "A Finished Film",
  synopsis: "A sufficiently detailed synopsis for the Bridge submission review.",
  language: "Malayalam",
  countryOfOrigin: "India",
  year: 2024,
  runtimeMinutes: 112,
};

const draft = {
  status: "DRAFT" as const,
  submissionStatus: "DRAFT" as const,
  submissionType: null,
};

test("Creator may submit a complete finished-film draft", () => {
  assert.doesNotThrow(() => assertCreatorTitleCanSubmit(draft, validMetadata));
});

test("Creator submission blocks incomplete metadata and non-draft states", () => {
  assert.throws(
    () => assertCreatorTitleCanSubmit(draft, { ...validMetadata, runtimeMinutes: null }),
    /Complete title name/,
  );
  assert.throws(
    () => assertCreatorTitleCanSubmit({ ...draft, status: "UPLOADING" }, validMetadata),
    /Only a DRAFT/,
  );
  assert.throws(
    () => assertCreatorTitleCanSubmit({ ...draft, submissionStatus: "SUBMITTED" }, validMetadata),
    /already been submitted/,
  );
});

test("Story concepts and archived records cannot enter the finished-film submission flow", () => {
  assert.throws(
    () => assertCreatorTitleCanSubmit({ ...draft, submissionType: "story_concept" }, validMetadata),
    /separate curation workflow/,
  );
  assert.throws(
    () => assertCreatorTitleCanSubmit({ ...draft, deletedAt: new Date() }, validMetadata),
    /archived/,
  );
});

test("Only empty, unsubmitted finished-film drafts can be soft-deleted", () => {
  assert.doesNotThrow(() => assertCreatorTitleCanBeSoftDeleted(draft, false));
  assert.throws(() => assertCreatorTitleCanBeSoftDeleted(draft, true), /uploaded assets/);
  assert.throws(
    () => assertCreatorTitleCanBeSoftDeleted({ ...draft, submissionStatus: "SUBMITTED" }, false),
    /unsubmitted DRAFT/,
  );
  assert.throws(
    () => assertCreatorTitleCanBeSoftDeleted({ ...draft, submissionType: "story_concept" }, false),
    /Story \/ Concept/,
  );
});
