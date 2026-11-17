import assert from "node:assert/strict";
import test from "node:test";
import {
  isWorkspacePresetManager,
  legalPresetConfig,
  operationalPresetConfig,
  workspacePresetWriteInput,
} from "./workspace-presets-policy.ts";

test("operational presets accept only allowlisted TVOD defaults", () => {
  const result = operationalPresetConfig.safeParse({
    companyName: "StreamVista OPC Pvt Ltd",
    defaultTerritory: "WORLDWIDE",
    defaultLanguage: "Malayalam",
    licenseModel: "TVOD",
    documentCategories: ["MASTER", "TRAILER", "OWNERSHIP_EVIDENCE"],
  });
  assert.equal(result.success, true);
  assert.equal(operationalPresetConfig.safeParse({
    companyName: "StreamVista",
    defaultTerritory: "IN",
    defaultLanguage: "Malayalam",
    licenseModel: "TVOD",
    documentCategories: [],
  }).success, false);
});

test("legal presets require agreement references and a 100 percent split", () => {
  const valid = {
    agreementReference: "CB-TVOD-2026-003",
    ownershipReference: "DIL/1/135/2013-THI",
    rightsOwnerSharePct: 65,
    distributorSharePct: 35,
    exclusivity: "NON_EXCLUSIVE" as const,
    suggestedValidityDays: 365,
  };
  assert.equal(legalPresetConfig.safeParse(valid).success, true);
  assert.equal(legalPresetConfig.safeParse({ ...valid, distributorSharePct: 34 }).success, false);
  assert.equal(legalPresetConfig.safeParse({ ...valid, ownershipReference: "short" }).success, false);
});

test("preset write schema rejects mismatched type/configuration pairs", () => {
  assert.equal(workspacePresetWriteInput.safeParse({
    name: "Default TVOD",
    type: "OPERATIONAL",
    configuration: {
      companyName: "StreamVista OPC Pvt Ltd",
      defaultTerritory: "WORLDWIDE",
      defaultLanguage: "Malayalam",
      licenseModel: "TVOD",
      documentCategories: [],
    },
  }).success, true);
  assert.equal(workspacePresetWriteInput.safeParse({
    name: "Wrong type",
    type: "OPERATIONAL",
    configuration: { agreementReference: "CB-TVOD-2026-003" },
  }).success, false);
});

test("only verified Super Admin sessions manage presets", () => {
  assert.equal(isWorkspacePresetManager({ emailVerified: true, internalRole: "super_admin" }), true);
  assert.equal(isWorkspacePresetManager({ emailVerified: false, internalRole: "super_admin" }), false);
  assert.equal(isWorkspacePresetManager({ emailVerified: true, internalRole: "admin" }), false);
  assert.equal(isWorkspacePresetManager({ emailVerified: true, internalRole: null }), false);
});
