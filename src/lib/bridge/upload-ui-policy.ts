import type { InternalRole, TitleStatus } from "./types.ts";

export function canUploadTitleAssets(actor: {
  emailVerified: boolean;
  internalRole: InternalRole | null;
}, status: TitleStatus): boolean {
  return actor.emailVerified &&
    actor.internalRole === "super_admin" &&
    ["DRAFT", "UPLOADING", "PREPARING", "LIVE_FOR_BUYERS"].includes(status);
}
