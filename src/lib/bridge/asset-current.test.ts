import assert from "node:assert/strict";
import test from "node:test";
import { selectCurrentAssets } from "./asset-current.ts";

test("gallery exposes only the newest verified row for each asset kind", () => {
  const rows = [
    { id: "old-poster", kind: "poster_vertical", created_at: "2026-10-01T10:00:00Z", byte_size: 100 },
    { id: "new-poster", kind: "poster_vertical", created_at: "2026-10-02T10:00:00Z", byte_size: 120 },
    { id: "master-1", kind: "master", created_at: "2026-10-01T09:00:00Z", byte_size: 500 },
  ];
  const current = selectCurrentAssets(rows);
  assert.deepEqual(current.map(({ id, versionNumber, versionCount }) => ({ id, versionNumber, versionCount })), [
    { id: "new-poster", versionNumber: 2, versionCount: 2 },
    { id: "master-1", versionNumber: 1, versionCount: 1 },
  ]);
});

test("gallery keeps different asset kinds separate and uses a stable tie-breaker", () => {
  const current = selectCurrentAssets([
    { id: "certificate-a", kind: "censor_certificate", created_at: "2026-10-01T10:00:00Z" },
    { id: "certificate-b", kind: "censor_certificate", created_at: "2026-10-01T10:00:00Z" },
    { id: "subtitle-a", kind: "subtitle", created_at: "2026-10-01T10:00:00Z" },
  ]);
  assert.deepEqual(current.map(({ id, versionNumber, versionCount }) => ({ id, versionNumber, versionCount })), [
    { id: "subtitle-a", versionNumber: 1, versionCount: 1 },
    { id: "certificate-b", versionNumber: 2, versionCount: 2 },
  ]);
});

test("gallery does not collapse distinct formats of the same asset kind", () => {
  const current = selectCurrentAssets([
    { id: "certificate-pdf", kind: "censor_certificate", content_type: "application/pdf", created_at: "2026-10-01T10:00:00Z" },
    { id: "certificate-scan", kind: "censor_certificate", content_type: "image/png", created_at: "2026-10-01T09:00:00Z" },
  ]);
  assert.deepEqual(current.map(({ id }) => id), ["certificate-pdf", "certificate-scan"]);
});
