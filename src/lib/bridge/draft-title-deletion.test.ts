import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");
const start = source.indexOf("export const deleteDraftTitle");
const end = source.indexOf("\n\n", source.indexOf("return { id: data.id, deleted: true as const };", start));
const deletion = source.slice(start, end < 0 ? undefined : end);

test("draft deletion is owner-authorized, transactional, and locked to DRAFT", () => {
  assert.ok(start >= 0);
  assert.match(deletion, /confirmation: z\.literal\("DELETE DRAFT"\)/);
  assert.match(deletion, /canMutateTitle\(actor, title/);
  assert.match(deletion, /sql\.transaction/);
  assert.match(deletion, /for update/i);
  assert.match(deletion, /status !== "DRAFT"/);
  assert.match(deletion, /title\.draft_deleted/);
});

test("draft deletion blocks story concepts and linked records or storage-backed assets", () => {
  assert.match(deletion, /submission_type/);
  assert.match(deletion, /Story Concepts must remain in their separate submission workflow/);
  assert.match(deletion, /if \(blocked\.length\)/);
  assert.match(deletion, /linked records or storage-backed assets remain/i);
});
