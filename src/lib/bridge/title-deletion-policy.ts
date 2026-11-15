export type TitleDeletionStorageState = {
  status: string;
  hasPosterKey: boolean;
  hasMasterKey: boolean;
  assetCount: number;
  assetVersionCount: number;
  ditSessionCount: number;
};

/**
 * Permanent deletion is only available for a completely empty DRAFT title.
 * Any uploaded, versioned, poster/master, or DIT-linked media is retained.
 */
export function getTitleDeletionBlockReason(state: TitleDeletionStorageState): string | null {
  if (state.status !== "DRAFT") {
    return "Only DRAFT titles can be deleted. UPLOADING, PREPARING, reviewed, and commercial titles are protected.";
  }
  if (state.hasPosterKey || state.hasMasterKey) {
    return "A poster or master is registered for this title. The title and its storage objects must be retained.";
  }
  if (state.assetCount > 0) {
    return "Registered title assets exist. The title and its storage objects must be retained.";
  }
  if (state.assetVersionCount > 0) {
    return "Asset versions exist. The title and its storage objects must be retained.";
  }
  if (state.ditSessionCount > 0) {
    return "A DIT ingest session exists. The title and its storage objects must be retained.";
  }
  return null;
}
