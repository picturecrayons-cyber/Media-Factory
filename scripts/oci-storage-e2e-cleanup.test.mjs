import assert from "node:assert/strict";
import test from "node:test";
import { cleanupOciE2E } from "./oci-storage-e2e-cleanup.mjs";

test("cleanup deletes and verifies both run-owned objects before checking the rolled-back fixture", async () => {
  const objects = new Set(["source", "sealed"]);
  const calls = [];
  const result = await cleanupOciE2E({
    runKeys: ["source", "sealed"],
    deleteObject: async (key) => {
      calls.push(`delete:${key}`);
      objects.delete(key);
    },
    objectExists: async (key) => {
      calls.push(`head:${key}`);
      return objects.has(key);
    },
    rollback: async () => calls.push("rollback"),
    verifyDatabaseState: async () => calls.push("verify-db"),
  });

  assert.deepEqual(calls, [
    "delete:sealed",
    "head:sealed",
    "delete:source",
    "head:source",
    "rollback",
    "verify-db",
  ]);
  assert.deepEqual(result, {
    cleanedObjectCount: 2,
    databaseRolledBack: true,
    fixtureVerified: true,
  });
  assert.equal(objects.size, 0);
});

test("cleanup still attempts rollback and fixture verification when object cleanup fails", async () => {
  const calls = [];
  await assert.rejects(
    cleanupOciE2E({
      runKeys: ["source", "sealed"],
      deleteObject: async (key) => {
        calls.push(`delete:${key}`);
        if (key === "sealed") throw new Error("simulated delete failure");
      },
      objectExists: async (key) => {
        calls.push(`head:${key}`);
        return key === "sealed";
      },
      rollback: async () => calls.push("rollback"),
      verifyDatabaseState: async () => calls.push("verify-db"),
    }),
    /CLEANUP_INCOMPLETE.*object deletion/,
  );
  assert.ok(calls.includes("rollback"));
  assert.ok(calls.includes("verify-db"));
});

test("cleanup fails closed and skips fixture assertion when rollback fails", async () => {
  let fixtureVerified = false;
  await assert.rejects(
    cleanupOciE2E({
      runKeys: [],
      deleteObject: async () => {},
      objectExists: async () => false,
      rollback: async () => {
        throw new Error("simulated rollback failure");
      },
      verifyDatabaseState: async () => {
        fixtureVerified = true;
      },
    }),
    /CLEANUP_INCOMPLETE.*rollback failed/,
  );
  assert.equal(fixtureVerified, false);
});
