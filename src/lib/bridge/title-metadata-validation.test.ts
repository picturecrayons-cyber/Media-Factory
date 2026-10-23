import assert from "node:assert/strict";
import test from "node:test";
import { metadataFirstTitleSchema } from "./title-metadata-validation.ts";

const validTitle = {
  name: "Synthetic Preview Test Title",
  language: "Malayalam",
  year: 2024,
  runtimeMinutes: 96,
  synopsis: "A synthetic synopsis long enough to pass the required metadata validation.",
  director: "Preview Test Director",
  producer: "Preview Test Production",
  contentType: "Film",
};

test("metadata-first schema accepts complete draft metadata", () => {
  const result = metadataFirstTitleSchema.safeParse(validTitle);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Synthetic Preview Test Title");
  }
});

test("metadata-first schema rejects every missing required field", () => {
  for (const field of ["name", "language", "year", "runtimeMinutes", "synopsis", "director", "producer", "contentType"]) {
    const incomplete = { ...validTitle } as Record<string, unknown>;
    delete incomplete[field];
    assert.equal(metadataFirstTitleSchema.safeParse(incomplete).success, false, `expected ${field} to be required`);
  }
});

test("metadata-first schema rejects blank text and out-of-range numeric metadata", () => {
  assert.equal(metadataFirstTitleSchema.safeParse({ ...validTitle, director: "   " }).success, false);
  assert.equal(metadataFirstTitleSchema.safeParse({ ...validTitle, producer: " " }).success, false);
  assert.equal(metadataFirstTitleSchema.safeParse({ ...validTitle, synopsis: "too short" }).success, false);
  assert.equal(metadataFirstTitleSchema.safeParse({ ...validTitle, year: 1894 }).success, false);
  assert.equal(metadataFirstTitleSchema.safeParse({ ...validTitle, runtimeMinutes: 0 }).success, false);
  assert.equal(metadataFirstTitleSchema.safeParse({ ...validTitle, runtimeMinutes: 601 }).success, false);
});

test("metadata-first validation does not create rights or publication authorization", () => {
  const result = metadataFirstTitleSchema.safeParse(validTitle);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal("rightsBasis" in result.data, false);
    assert.equal("authorizationAttested" in result.data, false);
    assert.equal("sublicensingAllowed" in result.data, false);
  }
});
