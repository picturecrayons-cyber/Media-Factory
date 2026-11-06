import test from "node:test";
import assert from "node:assert/strict";
import { mapBridgeAssetResponse } from "./assets.ts";

const row = {
  id: "asset-test-001",
  kind: "poster",
  s3_key: "private/object/path/poster.jpg",
  content_type: "image/jpeg",
  byte_size: 1024,
  storage_provider: "oci",
  storage_bucket: "private-bridge-bucket",
  storage_namespace: "tenant-namespace",
  storage_region: "ap-south-1",
  storage_endpoint: "https://objectstorage.ap-south-1.oraclecloud.com",
  created_at: "2026-11-06T00:00:00.000Z",
};

test("Buyer asset response redacts object keys and all storage provenance", () => {
  const response = mapBridgeAssetResponse(row, true);
  assert.equal(response.key, null);
  assert.equal(response.storageLocation, null);
  assert.equal(response.id, row.id);
  assert.equal(response.kind, row.kind);
  assert.equal(response.byteSize, row.byte_size);
  assert.equal(JSON.stringify(response).includes(row.s3_key), false);
  assert.equal(JSON.stringify(response).includes(row.storage_bucket), false);
  assert.equal(JSON.stringify(response).includes(row.storage_endpoint), false);
});

test("authorized Studio asset response exposes expandable storage provenance data", () => {
  const response = mapBridgeAssetResponse(row, false);
  assert.equal(response.key, row.s3_key);
  assert.deepEqual(response.storageLocation, {
    provider: "oci",
    bucket: "private-bridge-bucket",
    namespace: "tenant-namespace",
    region: "ap-south-1",
    endpoint: "https://objectstorage.ap-south-1.oraclecloud.com",
    path: row.s3_key,
  });
});
