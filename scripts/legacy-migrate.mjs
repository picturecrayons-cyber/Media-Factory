#!/usr/bin/env node
/**
 * Dry-run only. Reads a JSON array of legacy titles from stdin or --file.
 * Never writes to the database. Production import requires a later written owner approval.
 */
import { readFileSync } from "node:fs";
import { mapLegacyTitles } from "../src/lib/bridge/legacy-map.ts";

const apply = process.argv.includes("--apply");
if (apply) {
  console.error("Refusing --apply. Production import is blocked until a later written owner approval.");
  process.exit(2);
}

const fileFlag = process.argv.indexOf("--file");
let raw;
if (fileFlag >= 0) {
  const path = process.argv[fileFlag + 1];
  if (!path) {
    console.error("Missing --file path");
    process.exit(1);
  }
  raw = readFileSync(path, "utf8");
} else {
  raw = readFileSync(0, "utf8");
}

const parsed = JSON.parse(raw);
const rows = Array.isArray(parsed) ? parsed : parsed.titles ?? parsed.results ?? [];
const { mapped, report } = mapLegacyTitles(rows);
console.log(
  JSON.stringify(
    {
      mode: "dry-run",
      report,
      sample: mapped.slice(0, 5),
      note: "All mapped titles would insert as DRAFT. No rows written.",
    },
    null,
    2,
  ),
);
