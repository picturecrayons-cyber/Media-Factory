#!/usr/bin/env node
/**
 * Crayons Bridge release evidence gate.
 *
 * Read-only: reads a local JSON evidence manifest and emits a verdict.
 * It never calls deployment, database, payment, or object-storage mutation APIs.
 * Missing/invalid evidence fails closed. A declared status is not enough by
 * itself: every PASS requires a timestamp, evidence reference, and gate-specific
 * proof fields.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const GATES = [
  { id: 1, key: "deploymentMapping", label: "Public domain and Preview use intended builds", required: ["publicDomain.commitSha", "preview.commitSha", "publicDomain.deploymentId", "preview.deploymentId"] },
  { id: 2, key: "deploymentIdentity", label: "Vercel deployment identity", required: ["publicDomain.deploymentId", "preview.deploymentId", "vercelProjectId", "vercelTeamId"] },
  { id: 3, key: "pr334Deployment", label: "PR #334 performance changes deployed", required: ["expectedCommitSha", "preview.commitSha"] },
  { id: 4, key: "fontChange", label: "PR #334 font changes reflected", required: ["preview.commitSha", "fontRequestEvidence"] },
  { id: 5, key: "liveInstrumentation", label: "Vercel Live instrumentation experiment", required: ["preview.commitSha", "feedbackSettingEvidence"] },
  { id: 6, key: "performanceComparison", label: "Comparable browser performance measurements", required: ["beforeTrace", "afterTrace", "lcpBeforeMs", "lcpAfterMs", "mainThreadBeforeMs", "mainThreadAfterMs"] },
  { id: 7, key: "databaseIsolation", label: "Preview database isolation", required: ["previewDatabaseProjectRef", "productionDatabaseProjectRef", "isolationEvidence"] },
  { id: 8, key: "ociIsolation", label: "Non-production OCI storage isolation", required: ["ociTenancyFingerprint", "ociRegion", "ociTestBucket", "ociIsolationEvidence"] },
  { id: 9, key: "ociIntegrity", label: "OCI upload, copy and integrity verification", required: ["fixtureId", "sourceChecksum", "destinationChecksum", "readbackEvidence"] },
  { id: 10, key: "uploadRecovery", label: "Upload progress, retry, cancel and recovery", required: ["regressionRunId", "progressEvidence", "retryEvidence", "cancelEvidence", "recoveryEvidence"] },
  { id: 11, key: "razorpayTestMode", label: "Razorpay test-mode flow", required: ["paymentTestRunId", "testModeEvidence", "signatureVerificationEvidence", "serverVerificationEvidence"] },
  { id: 12, key: "rbac", label: "Role-based access controls", required: ["rbacRunId", "positiveRoleEvidence", "negativeRoleEvidence"] },
  { id: 13, key: "independentReview", label: "Independent engineering review", required: ["reviewer", "reviewEvidence", "openFindings"] },
  { id: 14, key: "rightsApproval", label: "Rights/legal approval for pilot title", required: ["titleId", "rightsEvidence", "authorizationEvidence"] },
  { id: 15, key: "loopAcceptance", label: "Bridge-to-LOOP delivery and buyer acceptance", required: ["titleId", "authorizedVersionId", "loopPublicationEvidence", "playbackEvidence", "buyerAcceptanceEvidence"] },
];

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
}
function hasValue(value) {
  return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
}
function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}
function evaluateGate(gate, record, manifest) {
  const missing = gate.required.filter((path) => !hasValue(getPath(record, path)));
  const reasons = [];
  if (record?.status !== "PASS") reasons.push("status is not PASS");
  if (!hasValue(record?.checkedAt) || Number.isNaN(Date.parse(record.checkedAt))) reasons.push("checkedAt is missing or invalid");
  if (!hasValue(record?.evidenceRef)) reasons.push("evidenceRef is missing");
  if (missing.length) reasons.push(`missing proof fields: ${missing.join(", ")}`);
  if (gate.key === "deploymentMapping") {
    for (const field of ["publicDomain.commitSha", "preview.commitSha"]) {
      if (!isSha(getPath(record, field))) reasons.push(`${field} must be a full 40-character commit SHA`);
    }
  }
  if (gate.key === "pr334Deployment") {
    if (!isSha(record?.expectedCommitSha) || !isSha(record?.preview?.commitSha) || record.expectedCommitSha.toLowerCase() !== record.preview.commitSha.toLowerCase()) {
      reasons.push("Preview SHA does not exactly match the expected PR #334 SHA");
    }
  }
  if (gate.key === "databaseIsolation") {
    if (record?.previewDatabaseProjectRef === record?.productionDatabaseProjectRef) reasons.push("Preview database ref equals Production database ref");
  }
  if (gate.key === "ociIsolation" && record?.productionCredentialsAvailable === true) {
    reasons.push("Preview has Production OCI credentials available");
  }
  if (gate.key === "razorpayTestMode" && record?.testMode !== true) reasons.push("Razorpay test mode is not explicitly proven");
  if (gate.key === "rightsApproval" && record?.authorized !== true) reasons.push("title-specific authorization is not explicitly true");
  return { id: gate.id, key: gate.key, label: gate.label, status: reasons.length ? "NOT VERIFIED" : "PASS", reasons };
}

async function main() {
  const file = process.argv[2];
  if (!file || file === "--help" || file === "-h") {
    console.log("Usage: node scripts/bridge-release-gates.mjs <evidence.json>");
    console.log("Read-only, fail-closed evaluator. See docs/bridge-release-evidence-gates.md.");
    process.exit(file ? 0 : 2);
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(file), "utf8"));
  } catch (error) {
    console.error(`Cannot read evidence manifest: ${error.message}`);
    process.exit(2);
  }
  const records = manifest?.gates && typeof manifest.gates === "object" ? manifest.gates : {};
  const results = GATES.map((gate) => evaluateGate(gate, records[gate.key], manifest));
  const blocked = results.filter((gate) => gate.status !== "PASS");
  const release = {
    generatedAt: new Date().toISOString(),
    manifestVersion: manifest?.version ?? null,
    verdict: blocked.length === 0 ? "CERTIFICATION CANDIDATE — HUMAN APPROVAL REQUIRED" : "NOT CERTIFIED",
    production: "HOLD / NO-GO",
    pilot: "NOT AUTHORIZED",
    passed: results.length - blocked.length,
    total: results.length,
    gates: results,
    safety: {
      readOnlyEvaluator: true,
      noDeploymentOrPromotionPerformed: true,
      noDatabaseOrStorageMutationPerformed: true,
      humanApprovalRequired: true,
    },
  };
  console.log(JSON.stringify(release, null, 2));
  if (blocked.length) process.exitCode = 1;
}

main();
