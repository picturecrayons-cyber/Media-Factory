import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageStudioSchedule,
  canTransitionStudioScheduleStatus,
  isValidStudioScheduleWindow,
} from "./studio-schedule-policy.ts";

test("only Studio owner, admin and producer can manage the production schedule", () => {
  assert.equal(canManageStudioSchedule("owner"), true);
  assert.equal(canManageStudioSchedule("admin"), true);
  assert.equal(canManageStudioSchedule("producer"), true);
  assert.equal(canManageStudioSchedule("dit"), false);
  assert.equal(canManageStudioSchedule("member"), false);
  assert.equal(canManageStudioSchedule(null), false);
});

test("schedule windows require valid dates with end after start", () => {
  assert.equal(isValidStudioScheduleWindow("2026-11-18T09:00:00Z", "2026-11-18T18:00:00Z"), true);
  assert.equal(isValidStudioScheduleWindow("2026-11-18T18:00:00Z", "2026-11-18T09:00:00Z"), false);
  assert.equal(isValidStudioScheduleWindow("not-a-date", "2026-11-18T18:00:00Z"), false);
});

test("schedule statuses follow the allowed production lifecycle", () => {
  assert.equal(canTransitionStudioScheduleStatus("SCHEDULED", "IN_PROGRESS"), true);
  assert.equal(canTransitionStudioScheduleStatus("SCHEDULED", "CANCELLED"), true);
  assert.equal(canTransitionStudioScheduleStatus("IN_PROGRESS", "COMPLETED"), true);
  assert.equal(canTransitionStudioScheduleStatus("IN_PROGRESS", "CANCELLED"), true);
  assert.equal(canTransitionStudioScheduleStatus("COMPLETED", "IN_PROGRESS"), false);
  assert.equal(canTransitionStudioScheduleStatus("CANCELLED", "SCHEDULED"), false);
});
