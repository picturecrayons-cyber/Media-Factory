export type PersistedAssetState = {
  id: string;
  kind: string;
  s3Key: string;
  byteSize: number | null;
  contentType: string | null;
  titleMasterKey: string | null;
  titlePosterKey: string | null;
  auditPresent: boolean;
};

export type VerifiedObjectHead = {
  byteSize: number;
  etag: string | null;
};

/**
 * Validate the complete persisted verification contract before any idempotent
 * path or UI response reports an asset as verified.
 */
export async function isPersistedAssetVerified(
  state: PersistedAssetState,
  verifyObject: (key: string, contentType: string | null) => Promise<VerifiedObjectHead>,
): Promise<boolean> {
  if (!Number.isSafeInteger(state.byteSize) || Number(state.byteSize) <= 0) return false;
  if (!state.s3Key.endsWith(`.verified/${state.id}`)) return false;
  if (state.kind === "master" && state.titleMasterKey !== state.s3Key) return false;
  if (["poster", "poster_vertical"].includes(state.kind) && state.titlePosterKey !== state.s3Key) return false;
  if (!state.auditPresent) return false;
  const head = await verifyObject(state.s3Key, state.contentType);
  return head.byteSize === Number(state.byteSize) && Boolean(head.etag);
}
