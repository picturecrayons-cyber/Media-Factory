import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("Creator and Studio submission review handoff", () => {
  it("starts submitted films in the state accepted by the Admin intake transition", async () => {
    const source = await readFile(new URL("./submissions.ts", import.meta.url), "utf8");
    assert.match(source, /const submittedStatus = "PREPARING"/);
    assert.match(source, /actor\.accountType/);
    assert.match(source, /title\.submission\.submit/);
  });

  it("writes title, rights, legal, intake, event and audit in one transaction", async () => {
    const source = await readFile(new URL("./submissions.ts", import.meta.url), "utf8");
    assert.match(source, /return sql\.begin\(async \(tx\) =>/);
    for (const table of [
      "bridge_titles",
      "bridge_rights_grants",
      "bridge_legal_cases",
      "bridge_title_submission_intake",
      "bridge_title_events",
    ]) assert.ok(source.includes(table), `missing ${table}`);
  });

  it("exposes finished-film intake and story-concept records to the admin workstation", async () => {
    const source = await readFile(new URL("./admin-workstations.ts", import.meta.url), "utf8");
    assert.match(source, /bridge_title_submission_intake/);
    assert.match(source, /bridge_story_concept_submissions/);
    assert.match(source, /canAccessAdminWorkstations\(actor\)/);
  });

  it("does not allow buyer or LOOP publication as a side effect of submission", async () => {
    const source = await readFile(new URL("./submissions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /bridge_loop_publications|insert into loop_titles|LIVE_FOR_BUYERS/);
  });
});
