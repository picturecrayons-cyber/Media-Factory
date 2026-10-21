import assert from "node:assert/strict";
import test from "node:test";
import { runWithCleanup } from "./oci-e2e-cleanup.mjs";

test("attempts every cleanup task when an earlier cleanup fails", async () => {
  const attempted = [];
  await assert.rejects(
    runWithCleanup(
      async () => "ok",
      () => [
        { label: "source cleanup failed", run: async () => {
          attempted.push("source");
          throw new Error("source delete denied");
        } },
        { label: "sealed cleanup failed", run: async () => {
          attempted.push("sealed");
        } },
      ],
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.message, "E2E cleanup failed");
      assert.equal(error.errors.length, 1);
      assert.equal(error.errors[0].message, "source cleanup failed");
      assert.equal(error.errors[0].cause.message, "source delete denied");
      return true;
    },
  );
  assert.deepEqual(attempted, ["source", "sealed"]);
});

test("preserves the operation failure together with cleanup failures", async () => {
  const operationError = new Error("payload integrity mismatch");
  await assert.rejects(
    runWithCleanup(
      async () => { throw operationError; },
      () => [
        { label: "source cleanup failed", run: async () => {
          throw new Error("delete failed");
        } },
        { label: "sealed cleanup failed", run: async () => {} },
      ],
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0], operationError);
      assert.equal(error.errors[1].cause.message, "delete failed");
      return true;
    },
  );
});

test("returns the operation result after successful cleanup", async () => {
  const attempted = [];
  const result = await runWithCleanup(
    async () => 42,
    () => [
      { label: "source cleanup failed", run: async () => attempted.push("source") },
      { label: "sealed cleanup failed", run: async () => attempted.push("sealed") },
    ],
  );
  assert.equal(result, 42);
  assert.deepEqual(attempted, ["source", "sealed"]);
});
