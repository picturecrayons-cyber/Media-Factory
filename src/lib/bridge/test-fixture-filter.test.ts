import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const predicateParts = [
  /upper\(coalesce\((?:t\.)?record_classification, ''\)\) <> 'TEST'/,
  /lower\((?:t\.)?id::text\) not like 'test-fixture-%'/,
  /lower\(coalesce\((?:t\.)?slug, ''\)\) not like 'test-fixture-%'/,
  /lower\(coalesce\((?:t\.)?name, ''\)\) not like '\[test only\]%'/,
];

test("Creator and Studio owned-title queries exclude TEST classification, fixture IDs, slugs and names", () => {
  const source = read("./titles.ts");
  for (const part of predicateParts) assert.match(source, part);
  assert.ok((source.match(/lower\((?:t\.)?id::text\) not like 'test-fixture-%'/g) ?? []).length >= 4);
});

test("Deliveries queries exclude TEST classification, fixture IDs, slugs and names", () => {
  const source = read("./delivery-jobs.ts");
  for (const part of predicateParts) assert.match(source, part);
  assert.ok((source.match(/lower\(t\.id::text\) not like 'test-fixture-%'/g) ?? []).length >= 2);
});

test("DIT title selectors exclude TEST classification, fixture IDs, slugs and names", () => {
  const source = read("./dit-agent.ts");
  for (const part of predicateParts) assert.match(source, part);
  assert.ok((source.match(/lower\(id::text\) not like 'test-fixture-%'/g) ?? []).length >= 2);
});
