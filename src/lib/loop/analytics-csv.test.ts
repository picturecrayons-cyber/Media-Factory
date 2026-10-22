import test from "node:test";
import assert from "node:assert/strict";
import { buildLoopAnalyticsCsv } from "./analytics-csv.ts";

test("exports quoted CSV with a stable header and CRLF lines", () => {
  const csv = buildLoopAnalyticsCsv([
    { metric: "Observed watch minutes", value: 17, unit: "minutes", source: "observational telemetry" },
  ]);
  assert.equal(csv, '"metric","value","unit","source"\r\n"Observed watch minutes","17","minutes","observational telemetry"\r\n');
});

test("escapes quotes and prevents spreadsheet formula execution", () => {
  const csv = buildLoopAnalyticsCsv([
    { metric: '=HYPERLINK("https://bad.example")', value: "+cmd", source: 'a "quoted" value' },
  ]);
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"https://bad.example\"\")\""));
  assert.ok(csv.includes("\"'+cmd\""));
  assert.ok(csv.includes("\"a \"\"quoted\"\" value\""));
});
