import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const recovery = await readFile(
  new URL("../.github/workflows/bridge-safe-ci-recovery.yml", import.meta.url),
  "utf8",
);
const monitor = await readFile(
  new URL("../.github/workflows/bridge-github-supervisor.yml", import.meta.url),
  "utf8",
);

test("supervisor and recovery use the Node 24-compatible GitHub Script action", () => {
  assert.match(monitor, /actions\\/github-script@v8/);
  assert.match(recovery, /actions\\/github-script@v8/);
  assert.doesNotMatch(monitor + recovery, /actions\\/github-script@v7/);
});

test("manual recovery pins the trusted CI workflow IDs and names", () => {
  assert.match(recovery, /\[363476266,\s*"CI"\]/);
  assert.match(recovery, /\[374508093,\s*"Scope A PostgreSQL Onboarding Verification"\]/);
  assert.match(recovery, /allowedWorkflows\.get\(run\.workflow_id\)/);
  assert.match(recovery, /run\.name !== allowedName/);
});

test("manual recovery rejects unsafe events and invalid run identities", () => {
  assert.match(recovery, /\["pull_request",\s*"push",\s*"workflow_dispatch"\]\.includes\(run\.event\)/);
  assert.match(recovery, /run\.head_branch === "main"/);
  assert.match(recovery, /run\.head_repository\?\.full_name/);
  assert.match(recovery, /\^\[0-9a-f\]\{40\}\$\/i\.test\(run\.head_sha/);
  assert.match(recovery, /run\.status !== "completed"/);
  assert.match(recovery, /\["failure", "timed_out"\]\.includes\(run\.conclusion\)/);
});

test("manual recovery only reruns failed jobs from the selected run", () => {
  assert.match(recovery, /reRunFailedJobsForWorkflowRun/);
  assert.doesNotMatch(recovery, /reRunWorkflow\(/);
});

test("scheduled monitor has a 15-minute cadence and excludes itself", () => {
  assert.match(monitor, /cron:\s*"\*\/15 \* \* \* \*"/);
  assert.match(monitor, /run\.name !== "Bridge GitHub Supervisor"/);
});

test("scheduled monitor deduplicates alerts by exact workflow-run ID", () => {
  assert.match(monitor, /workflow-run-\$\{run\.id\}/);
  assert.match(monitor, /openIssues\.some\(issue => !issue\.pull_request && issue\.title\.includes\(marker\)\)/);
  assert.match(monitor, /github\.rest\.issues\.create/);
});
