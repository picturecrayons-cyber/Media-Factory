import { z } from "zod";

export const DISTRIBUTION_MANDATE_VERSION = 1 as const;

export const DISTRIBUTION_MANDATE_DEFAULTS = {
  enabled: true,
  destinations: [
    "Crayons Loop",
    "External OTT",
    "Broadcast / TV",
    "TVOD / EST",
    "FAST",
    "Festival / Educational",
    "Buyer delivery",
  ],
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

export function isDestinationCovered(
  mandate: CreatorDistributionMandate,
  requestedDestinations: readonly string[],
): boolean {
  return requestedDestinations.every((destination) => mandate.destinations.includes(destination));
}

export function isMediaCovered(
  mandate: CreatorDistributionMandate,
  requestedMedia: readonly string[],
): boolean {
  return requestedMedia.every((medium) => mandate.media.includes(medium));
}

export function canSublicenseWithinMandate(
  mandate: CreatorDistributionMandate,
  titleGrantAllowsSublicensing: boolean,
): boolean {
  return mandate.enabled && titleGrantAllowsSublicensing && mandate.sublicensingAllowed;
}
