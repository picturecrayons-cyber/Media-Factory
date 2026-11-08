import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const authenticatedServerFunctions = [
  "../loop/catalog.ts", "../loop/profile.ts", "../bridge/assets.ts",
  "../bridge/session.ts", "../bridge/workflow.ts", "../bridge/profiles.ts",
  "../bridge/payments.ts", "../bridge/deliveries.ts", "../loop/subscriptions.ts",
  "../bridge/streamvista.ts", "../bridge/admin-workstations.ts",
  "../bridge/multilingual-rights.ts", "../bridge/loop-publication.ts",
  "../bridge/duplicate-reconciliation.ts", "../bridge/site-content.ts",
  "../bridge/service-revenue.ts", "../bridge/commercial-admin.ts",
  "../bridge/dmca.ts", "../bridge/titles.ts", "../bridge/story-concept-api.ts",
  "../bridge/submissions.ts", "../bridge/duplicate-title-merge.ts",
];

test("authenticated server functions do not serialize bearer context through GET query transport", () => {
  for (const path of authenticatedServerFunctions) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /createServerFn\(\s*\{\s*method:\s*["']GET["']/,
      `${path} must use POST so auth sendContext cannot enter a GET URL query`,
    );
  }
});
