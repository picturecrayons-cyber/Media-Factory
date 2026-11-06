import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const titles = source("./titles.ts");
const concepts = source("./story-concept-api.ts");
const form = source("../../components/bridge/story-concept-form.tsx");
const conceptRoute = source("../../routes/story-concepts.$conceptId.tsx");

test("finished film catalog and owner queries exclude story concepts", () => {
    assert.match(titles, /coalesce\\((?:t\\.)?submission_type, 'finished_film'\\) = 'finished_film'/);
  assert.match(titles, /coalesce\(submission_type, 'finished_film'\) = 'finished_film'/);
});

test("generic title loader rejects concept records rather than showing a film workspace", () => {
  assert.match(titles, /where t\.id = \$\{id\}[\s\S]{0,180}submission_type, 'finished_film'\) = 'finished_film'/);
});

test("concept submission navigates by concept submission ID", () => {
  assert.match(form, /story-concepts\/\$conceptId/);
  assert.match(form, /res\.concept\.id/);
});

test("concept creation is atomic and audit is in the same transaction", () => {
  assert.match(concepts, /sql\.transaction\(async \(tx\)/);
  assert.match(concepts, /writeAudit\([\s\S]*?\}, tx\)/);
});

test("concept creation has an idempotency key and pending-review initial state", () => {
  assert.match(concepts, /idempotencyKey: z\.string\(\)\.uuid\(\)/);
  assert.match(concepts, /on conflict \(idempotency_key\) do nothing/);
  assert.match(concepts, /'PENDING_REVIEW'/);
});

test("concept review actions are admin-only and fee certification gates buyer evaluation", () => {
  assert.match(concepts, /actor\.internalRole !== "admin" && actor\.internalRole !== "super_admin"/);
    assert.match(concepts, /data\\.status === \"BUYER_EVALUATION_APPROVED\" && !current\\.fee_certified_at/);
});

test("concept detail workspace does not load film assets or QC workflow", () => {
  assert.doesNotMatch(conceptRoute, /listTitleAssets|beginAssetMultipart|WorkflowDesk|QC_REVIEW|0 of 7 files/);
  assert.match(conceptRoute, /Payment certification/);
  assert.match(conceptRoute, /Admin review/);
});

test("concept workspace explicitly avoids automatic Loop publication", () => {
  assert.match(conceptRoute, /not published to Loop automatically/i);
});
