import assert from "node:assert/strict";
import test from "node:test";
import { cleanupOciE2E } from "./oci-storage-e2e-cleanup.mjs";

const rollbackAlreadyOriginal = async () => ({ outcome: "already-original" });
const verifiedDatabaseState = async () => ({ verified: true });

test("cleanup deletes and verifies both run-owned objects only after explicit DB rollback and independent verification", async () => {
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
    rollback: async () => {
      calls.push("rollback");
      return { outcome: "restored" };
    },
    verifyDatabaseState: async () => {
      calls.push("verify-db");
      return { verified: true };
    },
  });

  assert.deepEqual(calls, [
    "rollback",
    "verify-db",
    "delete:sealed",
    "head:sealed",
    "delete:source",
    "head:source",
  ]);
  assert.deepEqual(result, {
    cleanedObjectCount: 2,
    rollbackOutcome: "restored",
    databaseVerified: true,
  });
  assert.equal(objects.size, 0);
});

test("cleanup refuses to delete OCI objects when rollback returns without an explicit outcome", async () => {
  const calls = [];
  await assert.rejects(
    cleanupOciE2E({
      runKeys: ["source", "sealed"],
      deleteObject: async (key) => calls.push(`delete:${key}`),
      objectExists: async () => true,
      rollback: async () => undefined,
      verifyDatabaseState: verifiedDatabaseState,
    }),
    /rollback callback did not prove a recognized outcome; retained OCI objects/,
  );
  assert.deepEqual(calls, []);
});

test("cleanup refuses to delete OCI objects when independent verification is absent or inconclusive", async (t) => {
  await t.test("missing verifier", async () => {
    const calls = [];
    await assert.rejects(
      cleanupOciE2E({
        runKeys: ["source"],
        deleteObject: async (key) => calls.push(`delete:${key}`),
        objectExists: async () => true,
        rollback: rollbackAlreadyOriginal,
      }),
      /independent database state verification is required/,
    );
    assert.deepEqual(calls, []);
  });

  await t.test("verifier does not affirm restoration", async () => {
    const calls = [];
    await assert.rejects(
      cleanupOciE2E({
        runKeys: ["source"],
        deleteObject: async (key) => calls.push(`delete:${key}`),
        objectExists: async () => true,
        rollback: rollbackAlreadyOriginal,
        verifyDatabaseState: async () => ({ verified: false }),
      }),
      /independent database verifier did not affirm restored state/,
    );
    assert.deepEqual(calls, []);
  });
});

test("cleanup still attempts every run-owned object and fails closed when an object cannot be deleted", async () => {
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
      rollback: async () => {
        calls.push("rollback");
        return { outcome: "already-original" };
      },
      verifyDatabaseState: async () => {
        calls.push("verify-db");
        return { verified: true };
      },
    }),
    /CLEANUP_INCOMPLETE.*object deletion/,
  );
  assert.ok(calls.includes("rollback"));
  assert.ok(calls.includes("verify-db"));
  assert.ok(calls.includes("delete:source"));
});

test("cleanup fails closed and retains objects when rollback fails", async () => {
  let fixtureVerified = false;
  const calls = [];
  await assert.rejects(
    cleanupOciE2E({
      runKeys: [],
      deleteObject: async () => calls.push("delete"),
      objectExists: async () => false,
      rollback: async () => {
        calls.push("rollback");
        throw new Error("simulated rollback failure");
      },
      verifyDatabaseState: async () => {
        fixtureVerified = true;
        return { verified: true };
      },
    }),
    /CLEANUP_INCOMPLETE.*rollback failed/,
  );
  assert.equal(fixtureVerified, false);
  assert.deepEqual(calls, ["rollback"]);
});
