import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import testCase from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const predicateParts = [
  /upper\(coalesce\((?:t\.)?record_classification, ''\)\) <> 'TEST'/,
  /lower\((?:t\.)?id::text\) not like 'test-fixture-%'/,
  /lower\(coalesce\((?:t\.)?slug, ''\)\) not like 'test-fixture-%'/,
  /lower\(coalesce\((?:t\.)?name, ''\)\) not like '\[test only\]%'/,
];

testCase("Creator and Studio owned-title queries exclude canonical and explicit TEST fixtures", () => {
  const source = read("./titles.ts");
  for (const part of predicateParts) assert.match(source, part);
  assert.equal((source.match(/lower\(t?\.??id::text\) not like 'test-fixture-%'/g) ?? []).length >= 2, true);
});

testCase("Deliveries queries exclude TEST fixtures by classification, id, slug and title prefix", () => {
  const source = read("./delivery-jobs.ts");
  for (const part of predicateParts) assert.match(source, part);
});

testCase("DIT title selectors exclude TEST fixtures by classification, id, slug and title prefix", () => {
  const source = read("./dit-agent.ts");
  for (const part of predicateParts) assert.match(source, part);
});
