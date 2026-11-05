import test from "node:test";
import assert from "node:assert/strict";
import { assertInternalRoleGrantBlocked } from "./authorization-guards.ts";
import { readFile } from "node:fs/promises";

test("single-actor internal role grant fails closed", () => {
  assert.throws(assertInternalRoleGrantBlocked, /dual-control approval workflow is not implemented/);
});

test("internal role invitation blocks before database writes and mail", async () => {
  const source = await readFile(new URL("./profiles.ts", import.meta.url), "utf8");
  const start = source.indexOf("export const inviteInternalRole");
  const end = source.length;
  const handler = source.slice(start, end);
  const guard = handler.indexOf("assertInternalRoleGrantBlocked()");
  assert.ok(guard >= 0);
  assert.ok(guard < handler.indexOf("const sql = await getSql()"));
  assert.ok(guard < handler.indexOf("await mail("));
});
