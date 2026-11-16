export type TitleDeletionStorageState = {
  status: string;
  hasPosterKey: boolean;
  hasMasterKey: boolean;
  assetCount: number;
  assetVersionCount: number;
  ditSessionCount: number;
};

/**
 * Deletion remains disabled until an audited archive/restore and recovery
 * workflow is independently verified. The storage fields are retained in the
 * input contract so callers cannot accidentally treat a media-bearing title
 * as eligible while the guard is in place.
 */
export function getTitleDeletionBlockReason(_state: TitleDeletionStorageState): string {
  return "Permanent title deletion is disabled until the audited archive/restore workflow is verified.";
}
