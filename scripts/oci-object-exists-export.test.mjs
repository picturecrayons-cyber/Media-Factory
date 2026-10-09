import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("OCI object storage module exports objectExists exactly once", () => {
  const source = readFileSync(
    new URL("../src/lib/bridge/oci-object-storage.server.ts", import.meta.url),
    "utf8",
  );
  const declarations = source.match(/export\\s+async\\s+function\\s+objectExists\\s*\\(/g) ?? [];
  assert.equal(
    declarations.length,
    1,
    "oci-object-storage.server.ts must have exactly one exported objectExists declaration",
  );
});
