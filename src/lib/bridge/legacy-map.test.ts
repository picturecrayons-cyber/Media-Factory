import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapLegacyTitle, mapLegacyTitles } from "./legacy-map.ts";

describe("legacy title map", () => {
  it("always lands mapped titles in DRAFT", () => {
    const mapped = mapLegacyTitle({
      id: 9,
      title: "Koodal",
      title_ml: "കൂടൽ",
      status: "LIVE",
      year: "2024",
    });
    assert.equal(mapped.status, "DRAFT");
    assert.equal(mapped.name, "Koodal");
    assert.equal(mapped.nameMl, "കൂടൽ");
    assert.equal(mapped.year, 2024);
  });

  it("skips rows without id/name and reports the rest", () => {
    const { mapped, report } = mapLegacyTitles([
      { id: 1, name: "One" },
      { title: "missing-id" },
    ]);
    assert.equal(report.sourceCount, 2);
    assert.equal(report.mappedCount, 1);
    assert.equal(mapped[0].status, "DRAFT");
    assert.equal(report.skipped.length, 1);
  });
});
