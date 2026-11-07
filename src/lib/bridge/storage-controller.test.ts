import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("storage controller counts RESTORING assets independently from policy-evaluation rows", () => {
  const source = readFileSync(new URL("./storage-controller.ts", import.meta.url), "utf8");
  const evaluationQuery = source.indexOf("where a.restore_state in ('READY', 'AVAILABLE')");
  const restoringCountQuery = source.indexOf("where restore_state = 'RESTORING'");
  const restoreCountAssignment = source.indexOf("result.restoreCount = Number(restoringRows[0]?.count ?? 0)");

  assert.ok(evaluationQuery >= 0, "policy evaluation excludes assets currently restoring");
  assert.ok(restoringCountQuery > evaluationQuery, "restoring assets are counted by a separate query");
  assert.ok(restoreCountAssignment > restoringCountQuery, "result uses the independent restoring count");
  assert.match(source, /Planning estimates only \(USD\/GB-month\)/);
});
