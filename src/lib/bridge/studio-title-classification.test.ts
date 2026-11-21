import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { isStudioFinishedFilm, canStudioAccessTitle } from "./studio-title-classification.ts";

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

test("legacy titles without organization mapping remain owner-only until evidence-backed reconciliation", () => {
  const unscopedTitle = {
    titleOwnerUserId: "studio-owner",
    titleOwnerOrganizationId: null,
    actorOrganizationId: "org-streamvista",
    activeOrganizationMembership: true,
  };
  assert.equal(canStudioAccessTitle({ ...unscopedTitle, actorUserId: "studio-owner" }), true);
  assert.equal(canStudioAccessTitle({ ...unscopedTitle, actorUserId: "other-member" }), false);
});

test("Studio sharing requires exact organization match and active membership", () => {
  const base = {
    titleOwnerUserId: "studio-owner",
    titleOwnerOrganizationId: "org-a",
    actorUserId: "studio-member",
    actorOrganizationId: "org-a",
    activeOrganizationMembership: true,
  };
  assert.equal(canStudioAccessTitle(base), true);
  assert.equal(canStudioAccessTitle({ ...base, actorOrganizationId: "org-b" }), false);
  assert.equal(canStudioAccessTitle({ ...base, activeOrganizationMembership: false }), false);
  assert.equal(canStudioAccessTitle({ ...base, actorOrganizationId: null }), false);
});

test("Studio Finished Films server query filters by submission_type and active organization membership", () => {
  const source = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");
  const start = source.indexOf("export const listStudioFinishedFilms");
  const end = source.indexOf("export const getTitle", start);
  const query = source.slice(start, end);
  assert.match(query, /submission_type = 'finished_film'/);
  assert.match(query, /owner_user_id = \$\{actor\.userId\}/);
  assert.match(query, /owner_organization_id = \$\{organizationId\}/);
  assert.match(query, /m\.status = 'active'/);
  assert.doesNotMatch(query, /submission_type = 'story_concept'/);
});
