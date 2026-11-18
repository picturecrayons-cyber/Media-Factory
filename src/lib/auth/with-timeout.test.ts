import test from "node:test";
import assert from "node:assert/strict";
import { TimeoutError, withTimeout } from "./with-timeout.ts";

test("returns a completed request result", async () => {
  assert.equal(await withTimeout(Promise.resolve("ready"), 50), "ready");
});

test("rejects a stalled request with a typed timeout", async () => {
  let settled = false;
  const request = new Promise<string>((resolve) => {
    setTimeout(() => { settled = true; resolve("late"); }, 30);
  });
  await assert.rejects(withTimeout(request, 5, "Profile lookup timed out."), (error: unknown) => {
    assert.ok(error instanceof TimeoutError);
    assert.equal(error.message, "Profile lookup timed out.");
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(settled, true, "timeout must not cancel or mutate the underlying request");
});

test("preserves the original request error", async () => {
  const failure = new Error("Database unavailable");
  await assert.rejects(withTimeout(Promise.reject(failure), 50), failure);
});
