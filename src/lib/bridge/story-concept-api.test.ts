import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./story-concept-api.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../../supabase/migrations/20261027_story_concept_submission.sql", import.meta.url),
  "utf8",
);

test("Story Concept creation is atomic and durably idempotent", () => {
  assert.match(api, /sql\.transaction\(async \(tx\)/);
  assert.match(api, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(api, /bridge_story_concept_idempotency/);
  assert.match(api, /request_hash !== requestHash/);
  assert.match(api, /writeAudit\([\s\S]*?\}, tx\)/);
});

test("Story Concept creation requires an active service and verified captured payment", () => {
  assert.match(api, /STORY_CONCEPT_NETWORK_SUBMISSION/);
  assert.match(api, /purpose = 'story_concept_submission'/);
  assert.match(api, /status = 'captured'/);
  assert.match(api, /verified_at is not null/);
  assert.match(api, /title_id is null/);
  assert.match(api, /base_price_paise/);
  assert.match(api, /Number\(payment\[0\]\.amount_paise\) !== Number\(rate\[0\]\.base_price_paise\)/);
  assert.match(api, /payment_id, logline/);
  assert.match(api, /paymentId: data\.paymentId \?\? null/);
});

test("Story Concept curation locks the row and audits in the same transaction", () => {
  const curation = api.slice(api.indexOf("export const updateStoryConceptCuration"));
  assert.match(curation, /sql\.transaction\(async \(tx\)/);
  assert.match(curation, /for update/);
  assert.match(curation, /writeAudit\([\s\S]*?\}, tx\)/);
});

test("Story Concept idempotency storage is private and catalog seed uses canonical constraints", () => {
  assert.match(migration, /PRIMARY KEY \(actor_user_id, idempotency_key\)/);
  assert.match(migration, /ALTER TABLE public\.bridge_story_concept_idempotency ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.bridge_story_concept_idempotency FROM anon, authenticated/);
  assert.match(migration, /bridge_story_concept_payment_unique_idx/);
  assert.match(migration, /'PREPARE'[\s\S]*?'FIXED'[\s\S]*?false/);
  assert.doesNotMatch(migration, /'FIXED_PER_TITLE'|'description, why,/);
});
