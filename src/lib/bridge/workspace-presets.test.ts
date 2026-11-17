import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
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


test("workspace preset migration creates an RLS-protected server-only table", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    const migration = readFileSync(
      new URL("../../../migrations/0016_bridge_workspace_presets.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    const result = await db.query<{
      rls_enabled: boolean;
      anon_select: boolean;
      authenticated_insert: boolean;
    }>(`
      select c.relrowsecurity as rls_enabled,
        has_table_privilege('anon', 'public.bridge_workspace_presets', 'SELECT') as anon_select,
        has_table_privilege('authenticated', 'public.bridge_workspace_presets', 'INSERT') as authenticated_insert
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'bridge_workspace_presets'
    `);
    assert.equal(result.rows[0]?.rls_enabled, true);
    assert.equal(result.rows[0]?.anon_select, false);
    assert.equal(result.rows[0]?.authenticated_insert, false);
  } finally {
    await db.close();
  }
});
