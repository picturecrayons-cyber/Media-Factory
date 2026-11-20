import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "src/lib/loop/catalog.ts", "src/lib/loop/profile.ts",
  "src/lib/bridge/assets.ts", "src/lib/bridge/session.ts",
  "src/lib/bridge/payments.ts", "src/lib/bridge/investor.ts",
  "src/lib/bridge/workflow.ts", "src/lib/bridge/profiles.ts",
  "src/lib/bridge/deliveries.ts", "src/lib/loop/subscriptions.ts",
  "src/lib/bridge/streamvista.ts", "src/lib/bridge/delivery-jobs.ts",
  "src/lib/bridge/studio-members.ts", "src/lib/bridge/story-concept-api.ts",
  "src/lib/bridge/titles.ts", "src/lib/bridge/admin-workstations.ts",
  "src/lib/bridge/multilingual-rights.ts", "src/lib/bridge/dit-agent.ts",
  "src/lib/bridge/duplicate-reconciliation.ts", "src/lib/bridge/loop-publication.ts",
  "src/lib/bridge/site-content.ts", "src/lib/bridge/service-revenue.ts",
  "src/lib/bridge/commercial-admin.ts", "src/lib/bridge/dmca.ts",
  "src/lib/bridge/submissions.ts", "src/lib/bridge/duplicate-title-merge.ts",
];

test("authenticated server functions never transport bearer context through GET query strings", async () => {
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const authenticatedGet = /createServerFn\\(\\{\\s*method:\\s*["']GET["']\\s*\\}\\)([\\s\\S]*?)\\.middleware\\(\\[authMiddleware\\]\\)/g;
    assert.equal([...source.matchAll(authenticatedGet)].length, 0, `${file} still declares an authenticated GET server function`);
  }
});
