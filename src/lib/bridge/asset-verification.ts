import type { BridgeTitle } from "./types";

export type PersistedAssetCandidate = {
  id: string;
  kind: string;
  s3_key: string;
  byte_size: number | null;
  content_type: string | null;
};

/** Validate every durable signal before exposing an asset as verified. */
export async function assertPersistedAssetVerified(
  asset: PersistedAssetCandidate,
  title: Pick<BridgeTitle, "masterKey" | "posterKey">,
  auditPresent: boolean,
  verifyObject: (key: string, contentType: string | null) => Promise<{ byteSize: number; etag: string | null }>,
): Promise<void> {
  if (asset.byte_size == null || asset.byte_size <= 0) throw new Error("Asset has no persisted byte size");
  if (!asset.s3_key.endsWith(`.verified/${asset.id}`)) throw new Error("Asset does not reference its immutable verified object");
  const sealed = await verifyObject(asset.s3_key, asset.content_type);
  if (sealed.byteSize !== Number(asset.byte_size) || !sealed.etag) throw new Error("Stored asset metadata does not match its immutable verified object");
  if (asset.kind === "master" && title.masterKey !== asset.s3_key) throw new Error("Verified master reference does not match the asset record");
  if (["poster", "poster_vertical"].includes(asset.kind) && title.posterKey !== asset.s3_key) throw new Error("Verified poster reference does not match the asset record");
  if (!auditPresent) throw new Error("Verified asset audit record is missing");
}
