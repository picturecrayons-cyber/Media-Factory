import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTitleAuditGroups } from "./title-audit.ts";

test("audit only groups exact normalized title, language and year", () => {
  const result = buildTitleAuditGroups([
    { id: "one", name: "AANDAAL", language: "Malayalam", year: 2024 },
    { id: "two", name: "aandaal", language: "malayalam", year: "2024" },
    { id: "three", name: "AANDAAL", language: "Telugu", year: 2024 },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].records.map((row) => row.id), ["one", "two"]);
});
