export type BridgeAssetResponseRow = {
  id: string;
  kind: string;
  s3_key: string;
  content_type: string | null;
  byte_size: number | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_namespace: string | null;
  storage_region: string | null;
  storage_endpoint: string | null;
  created_at: string | Date;
};

export function mapBridgeAssetResponse(r: BridgeAssetResponseRow, buyer: boolean) {
  return {
    id: r.id,
    kind: r.kind,
    key: buyer ? null : r.s3_key,
    contentType: r.content_type,
    byteSize: r.byte_size,
    verified: Number(r.byte_size) > 0,
    storageLocation: buyer ? null : {
      provider: r.storage_provider,
      bucket: r.storage_bucket,
      namespace: r.storage_namespace,
      region: r.storage_region,
      endpoint: r.storage_endpoint,
      path: r.s3_key,
    },
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

