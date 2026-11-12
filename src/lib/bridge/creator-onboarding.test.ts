import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("independent creator onboarding enters Creator desk before title intake validation", () => {
  const source = readFileSync(new URL("../../routes/onboarding.tsx", import.meta.url), "utf8");
  const completeProfile = source.indexOf("await completeOnboarding({");
  const creatorRedirect = source.indexOf('if (accountType === "independent_creator")', completeProfile);
  const titleRequired = source.indexOf('if (!titleName.trim())', completeProfile);

  assert.notEqual(completeProfile, -1, "profile completion call must exist");
  assert.notEqual(creatorRedirect, -1, "Creator redirect must exist");
  assert.notEqual(titleRequired, -1, "title validation must remain for title-intake flows");
  assert.ok(creatorRedirect > completeProfile, "Creator redirect must follow profile completion");
  assert.ok(creatorRedirect < titleRequired, "Creator redirect must happen before title validation");
  assert.match(source.slice(creatorRedirect, titleRequired), /navigate\(\{ to: "\/creator", replace: true \}\)/);
});

test("Creator desk keeps title submission as a separate dashboard action", () => {
  const source = readFileSync(new URL("../../routes/creator.tsx", import.meta.url), "utf8");
  assert.match(source, /<NewSubmissionPanel\s*\/>/);
  assert.match(source, /<TitleList empty="No titles yet\. Start with a new submission\."\s*\/>/);
});
