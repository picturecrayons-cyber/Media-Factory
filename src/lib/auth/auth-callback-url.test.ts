import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthCallbackUrl } from "./auth-callback-url.ts";

const PREVIEW = "https://bridge-rjlkjcvw5-stream-vista-opc-pvt-ltd-s-projects.vercel.app";

test("test signup callback stays on the current approved Bridge Preview", () => {
  assert.equal(
    resolveAuthCallbackUrl({ testAuthEnabled: true, runtimeOrigin: PREVIEW }),
    PREVIEW + "/auth/callback",
  );
});

test("test Auth refuses to send confirmation callbacks to Production", () => {
  assert.throws(
    () => resolveAuthCallbackUrl({ testAuthEnabled: true, runtimeOrigin: "https://www.crayonspictures.in" }),
    /Preview origin/,
  );
  assert.throws(
    () => resolveAuthCallbackUrl({ testAuthEnabled: true }),
    /Preview origin/,
  );
});

test("normal Production Auth keeps the canonical callback", () => {
  assert.equal(
    resolveAuthCallbackUrl({ testAuthEnabled: false, runtimeOrigin: PREVIEW }),
    "https://www.crayonspictures.in/auth/callback",
  );
});
