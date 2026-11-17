import { z } from "zod";

const documentCategory = z.enum([
  "MASTER",
  "TRAILER",
  "SCREENER",
  "POSTER",
  "STILL",
  "SUBTITLE",
  "CENSOR_CERTIFICATE",
  "OWNERSHIP_EVIDENCE",
  "SIGNED_AGREEMENT",
]);

export const operationalPresetConfig = z.object({
  companyName: z.string().trim().min(2).max(120),
  defaultTerritory: z.literal("WORLDWIDE"),
  defaultLanguage: z.string().trim().min(2).max(40),
  licenseModel: z.literal("TVOD"),
  documentCategories: z.array(documentCategory).max(9),
});

export const legalPresetConfig = z.object({
  agreementReference: z.string().trim().min(8).max(500),
  ownershipReference: z.string().trim().min(8).max(500),
  rightsOwnerSharePct: z.number().int().min(0).max(100),
  distributorSharePct: z.number().int().min(0).max(100),
  exclusivity: z.enum(["EXCLUSIVE", "NON_EXCLUSIVE"]),
  suggestedValidityDays: z.number().int().min(1).max(3650).optional(),
}).superRefine((value, ctx) => {
  if (value.rightsOwnerSharePct + value.distributorSharePct !== 100) {
    ctx.addIssue({
      code: "custom",
      path: ["distributorSharePct"],
      message: "Revenue shares must total exactly 100%",
    });
  }
});

export const workspacePresetConfig = z.discriminatedUnion("type", [
  z.object({ type: z.literal("OPERATIONAL"), configuration: operationalPresetConfig }),
  z.object({ type: z.literal("LEGAL"), configuration: legalPresetConfig }),
]);

export const workspacePresetWriteInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3).max(100),
  ...workspacePresetConfig.shape,
});

export type OperationalPresetConfig = z.infer<typeof operationalPresetConfig>;
export type LegalPresetConfig = z.infer<typeof legalPresetConfig>;
export type WorkspacePresetWriteInput = z.infer<typeof workspacePresetWriteInput>;
export type WorkspacePresetConfig = OperationalPresetConfig | LegalPresetConfig;

export function isWorkspacePresetManager(actor: {
  emailVerified: boolean;
  internalRole: string | null;
}): boolean {
  return actor.emailVerified && actor.internalRole === "super_admin";
}
