import { z } from "zod";

export const DISTRIBUTION_MANDATE_VERSION = 1 as const;

export const DISTRIBUTION_MANDATE_DEFAULTS = {
  enabled: true,
  destinations: ["Crayons Loop", "External OTT", "Broadcast / TV", "TVOD / EST", "FAST", "Festival / Educational", "Buyer delivery"],
  media: ["SVOD", "TVOD", "AVOD", "FAST", "BROADCAST", "THEATRICAL", "AIRLINE", "EDUCATIONAL", "FESTIVAL"],
  sublicensingAllowed: false,
} as const;

export const distributionMandateSchema = z.object({
  enabled: z.literal(true),
  version: z.literal(DISTRIBUTION_MANDATE_VERSION),
  destinations: z.array(z.string().min(2).max(80)).min(1).max(20),
  media: z.array(z.string().min(2).max(40)).min(1).max(20),
  acceptedAt: z.string().datetime(),
  consentTextVersion: z.literal("creator-distribution-mandate-v1"),
  sublicensingAllowed: z.literal(false),
});

export type CreatorDistributionMandate = z.infer<typeof distributionMandateSchema>;

export function createDefaultDistributionMandate(acceptedAt: string): CreatorDistributionMandate {
  return distributionMandateSchema.parse({
    ...DISTRIBUTION_MANDATE_DEFAULTS,
    version: DISTRIBUTION_MANDATE_VERSION,
    acceptedAt,
    consentTextVersion: "creator-distribution-mandate-v1",
  });
}

export function isDestinationCovered(mandate: CreatorDistributionMandate, requestedDestinations: readonly string[]): boolean {
  return requestedDestinations.every((destination) => mandate.destinations.includes(destination));
}

/** A Creator/Studio mandate can never authorize onward sublicensing. */
export function canSublicenseWithinMandate(mandate: CreatorDistributionMandate, titleGrantAllowsSublicensing: boolean): boolean {
  return mandate.enabled && mandate.sublicensingAllowed && titleGrantAllowsSublicensing;
}

/** Only the verified Bridge Super Admin decision layer may issue a sublicense. */
export function assertBridgeSublicensingAuthority(actor: { internalRole?: string | null; accountType?: string | null }) {
  if (actor.internalRole !== "super_admin") {
    throw new Error("Only Crayons Bridge Super Admin may authorize sublicensing.");
  }
}

/** A Bridge decision is still constrained by the rights holder's title-specific grant. */
export function canBridgeAuthorizeSublicensing(
  actor: { internalRole?: string | null; accountType?: string | null },
  titleGrantAllowsSublicensing: boolean,
) {
  return actor.internalRole === "super_admin" && titleGrantAllowsSublicensing;
}

export function isMediaCovered(mandate: CreatorDistributionMandate, requestedMedia: readonly string[]): boolean {
  return requestedMedia.every((medium) => mandate.media.includes(medium));
}
