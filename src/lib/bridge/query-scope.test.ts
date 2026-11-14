import test from "node:test";
import assert from "node:assert/strict";
import { bridgeWorkspaceQueryKey } from "./query-scope";

test("workspace query keys are stable for the same actor", () => {
  const actor = { userId: "creator-a", organizationId: null };
  assert.deepEqual(bridgeWorkspaceQueryKey("bridge-titles", actor), bridgeWorkspaceQueryKey("bridge-titles", actor));
});

test("workspace query keys isolate different users and studio organizations", () => {
  const creator = bridgeWorkspaceQueryKey("bridge-titles", { userId: "creator-a" });
  const studioA = bridgeWorkspaceQueryKey("bridge-titles", { userId: "studio-a", organizationId: "org-a" });
  const studioB = bridgeWorkspaceQueryKey("bridge-titles", { userId: "studio-b", organizationId: "org-b" });
  assert.notDeepEqual(creator, studioA);
  assert.notDeepEqual(studioA, studioB);
  assert.notDeepEqual(
    bridgeWorkspaceQueryKey("bridge-studio-members", { userId: "owner-a", organizationId: "org-a" }),
    bridgeWorkspaceQueryKey("bridge-studio-members", { userId: "owner-b", organizationId: "org-b" }),
  );
});
