import test from "node:test";
import assert from "node:assert/strict";
import { A2A_SKILLS, getA2ASkill } from "./registry.ts";

test("A2A business skill registry is unique and read-only", () => {
  assert.equal(new Set(A2A_SKILLS.map((skill) => skill.id)).size, A2A_SKILLS.length);
  assert.equal(A2A_SKILLS.length, 7);
  assert.ok(A2A_SKILLS.every((skill) => skill.mode === "read"));
  assert.equal(getA2ASkill("lead_qualification")?.agent, "sales_intelligence");
  assert.equal(getA2ASkill("missing_skill"), undefined);
});
