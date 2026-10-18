import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTitleAuditGroups, normalizeAuditTitle } from "./title-audit.ts";

describe("canonical title audit candidate grouping", () => {
  it("normalizes case, punctuation, accents, and whitespace for discovery", () => {
    assert.equal(normalizeAuditTitle("  JÁNANAM—1947   Pranayam Thudarunnu "), "jananam 1947 pranayam thudarunnu");
  });

  it("groups only when normalized title, language, and year all match", () => {
    const groups = buildTitleAuditGroups([
      { id: "a", name: "AANDAAL", language: "Malayalam", year: 2024 },
      { id: "b", name: "Aandaal", original_language: "malayalam", year: "2024" },
      { id: "c", name: "Aandaal", language: "Malayalam", year: 2025 },
      { id: "d", name: "Aandaal", language: "Telugu", year: 2024 },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].classification, "MATCHED_IDENTITY_CANDIDATES");
    assert.deepEqual(groups[0].records.map((record) => record.id), ["a", "b"]);
    assert.equal(groups[0].year, 2024);
  });

  it("flags incomplete identity metadata for review without grouping it into a known version", () => {
    const groups = buildTitleAuditGroups([
      { id: "a", name: "Buffering", language: null, year: null },
      { id: "b", name: " buffering ", language: "Malayalam", year: 2024 },
      { id: "c", name: "BUFFERING", language: "Malayalam", year: 2024 },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups.find((group) => group.classification === "METADATA_REVIEW")?.records[0].id, "a");
    assert.deepEqual(
      groups.find((group) => group.classification === "MATCHED_IDENTITY_CANDIDATES")?.records.map((record) => record.id),
      ["b", "c"],
    );
  });

  it("does not invent candidates for unrelated titles", () => {
    assert.deepEqual(buildTitleAuditGroups([
      { id: "a", name: "Film One", language: "Malayalam", year: 2024 },
      { id: "b", name: "Film Two", language: "Malayalam", year: 2024 },
    ]), []);
  });
});
