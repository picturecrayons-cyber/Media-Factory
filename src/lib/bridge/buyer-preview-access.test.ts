import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Buyer catalog is limited to active, unexpired Admin-granted title previews", () => {
  const src = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");
  assert.match(src, /join bridge_buyer_title_access a on a\.title_id = t\.id/);
  assert.match(src, /a\.buyer_user_id = \$\{actor\.userId\}/);
  assert.match(src, /a\.revoked_at is null/);
  assert.match(src, /a\.expires_at is null or a\.expires_at > now\(\)/);
  assert.match(src, /public\.bridge_title_buyer_visibility\(t\.id\)/);
});

test("Direct Buyer title access requires an explicit, non-revoked preview grant", () => {
  const src = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");
  assert.match(src, /Private preview access has not been approved for this title/);
  assert.match(src, /buyer\.preview_access_granted/);
  assert.match(src, /hasStaffPermission\(actor, "title\.license"\)/);
});

test("Investor title previews remain limited to explicitly assigned participation records", () => {
  const src = readFileSync(new URL("./titles.ts", import.meta.url), "utf8");
  assert.match(src, /bridge_title_investors where title_id = \$\{title\.id\} and investor_user_id = \$\{actor\.userId\}/);
});
