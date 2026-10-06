import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDuplicateTitleMerge } from "./duplicate-title-merge";

const title = (id: string) => ({
  id, name: "Film", slug: id, language: "Malayalam", status: "DRAFT",
  owner_user_id: "owner", year: 2024, runtime_minutes: 100,
});

const rights = (overrides: Partial<any> = {}) => ({
  id: "r", territories: ["IN"], languages: ["Malayalam"],
  window_start: null, window_end: null, exclusivity: "NON_EXCLUSIVE", status: "VALID", ...overrides,
});

const base = () => ({
  identityCertain: true, canonical: title("canonical"), retiring: title("retiring"),
  canonicalRights: [rights()], retiringRights: [rights()],
  canonicalBuyers: [] as unknown[], retiringBuyers: [] as unknown[], canonicalAssets: [] as unknown[], retiringAssets: [] as unknown[],
  canonicalDeliveries: [] as unknown[], retiringDeliveries: [] as unknown[], canonicalLoopPublications: [] as unknown[], retiringLoopPublications: [] as unknown[],
});

test("safe exact duplicate", () => {
  assert.equal(evaluateDuplicateTitleMerge(base()).decision, "SAFE");
});

test("blocks uncertain title identity", () => {
  assert.equal(evaluateDuplicateTitleMerge({ ...base(), identityCertain: false }).decision, "BLOCK");
});

for (const [field, override, reason] of [
  ["language", { languages: ["Telugu"] }, "LANGUAGE_CONFLICT"],
  ["territory", { territories: ["AE"] }, "TERRITORY_CONFLICT"],
  ["exclusivity", { exclusivity: "EXCLUSIVE" }, "EXCLUSIVITY_CONFLICT"],
] as const) {
  test(`holds on ${field} conflict`, () => {
    const input = base();
    input.retiringRights = [rights(override)];
    const result = evaluateDuplicateTitleMerge(input);
    assert.equal(result.decision, "HOLD");
    assert.ok(result.reasons.includes(reason));
  });
}

test("holds on overlapping windows", () => {
  const input = base();
  input.canonicalRights = [rights({ window_start: "2026-01-01T00:00:00Z", window_end: "2027-01-01T00:00:00Z" })];
  input.retiringRights = [rights({ window_start: "2026-06-01T00:00:00Z", window_end: "2027-06-01T00:00:00Z" })];
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("WINDOW_CONFLICT"));
});

test("holds on buyer mapping conflict", () => {
  const input = base();
  input.canonicalBuyers = [{ buyer_user_id: "a", access: "exclusive" }];
  input.retiringBuyers = [{ buyer_user_id: "b", access: "exclusive" }];
  assert.equal(evaluateDuplicateTitleMerge(input).decision, "HOLD");
});

test("holds on asset version conflict", () => {
  const input = base();
  input.canonicalAssets = [{ id: "a", checksum_sha256: "one" }];
  input.retiringAssets = [{ id: "b", checksum_sha256: "two" }];
  assert.equal(evaluateDuplicateTitleMerge(input).decision, "HOLD");
});

test("holds on delivery reference conflict", () => {
  const input = base();
  input.canonicalDeliveries = [{ id: "d1", package_version: 1 }];
  input.retiringDeliveries = [{ id: "d2", package_version: 2 }];
  assert.equal(evaluateDuplicateTitleMerge(input).decision, "HOLD");
});

test("blocks when either side has a Loop publication", () => {
  const input = base();
  input.canonicalLoopPublications = [{ id: "p1", loop_title_id: "l1" }];
  input.retiringLoopPublications = [{ id: "p2", loop_title_id: "l2" }];
  assert.equal(evaluateDuplicateTitleMerge(input).decision, "BLOCK");
});

test("blocks Loop publication even when only the retiring title is published", () => {
  const input = base();
  input.retiringLoopPublications = [{ id: "p2", loop_title_id: "l2" }];
  assert.equal(evaluateDuplicateTitleMerge(input).decision, "BLOCK");
});

test("holds when title-level language differs", () => {
  const input = base();
  input.retiring = { ...input.retiring, language: "Telugu" };
  const result = evaluateDuplicateTitleMerge(input);
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("LANGUAGE_CONFLICT"));
});

test("safe when only one side has a non-conflicting reference", () => {
  const input = base();
  input.canonicalAssets = [{ id: "a", checksum_sha256: "same" }];
  input.retiringAssets = [];
  assert.equal(evaluateDuplicateTitleMerge(input).decision, "SAFE");
});
