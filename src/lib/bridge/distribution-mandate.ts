import { z } from "zod";
import type { Sql } from "@/lib/db";
import { writeAudit } from "./audit";

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


export async function ensureCreatorDistributionMandate(
  tx: Sql,
  creatorUserId: string,
  accepted: boolean,
): Promise<void> {
  const current = await tx<{ status: string }>`
    select status
    from bridge_creator_distribution_mandates
    where creator_user_id = ${creatorUserId}
    for update
  `;

  if (current[0]?.status === "ACTIVE") return;
  if (current.length > 0) {
    throw new Error("This account-level mandate is not active. A Super Admin review is required.");
  }
  if (!accepted) {
    throw new Error("Accept the Creator Distribution Mandate before submitting a title.");
  }

  const mandate = createDefaultDistributionMandate(new Date().toISOString());
  const inserted = await tx<{ creator_user_id: string }>`
    insert into bridge_creator_distribution_mandates
      (creator_user_id, mandate_version, status, scope, accepted_at, consent_text_version)
    values (
      ${creatorUserId}, ${mandate.version}, 'ACTIVE',
      ${JSON.stringify(mandate)}::jsonb, ${mandate.acceptedAt}, ${mandate.consentTextVersion}
    )
    on conflict (creator_user_id) do nothing
    returning creator_user_id
  `;

  if (inserted.length > 0) {
    await writeAudit({
      actorUserId: creatorUserId,
      action: "creator.distribution_mandate.accepted",
      entityType: "bridge_creator_distribution_mandate",
      entityId: creatorUserId,
      metadata: { mandateVersion: mandate.version, consentTextVersion: mandate.consentTextVersion },
    }, tx);
  }

  const finalState = await tx<{ status: string }>`
    select status
    from bridge_creator_distribution_mandates
    where creator_user_id = ${creatorUserId}
    for update
  `;
  if (finalState[0]?.status !== "ACTIVE") {
    throw new Error("Creator Distribution Mandate could not be activated.");
  }
}
