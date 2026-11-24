import { z } from "zod";
import type { Sql } from "@/lib/db";
import { writeAudit } from "./audit";
export const DISTRIBUTION_MANDATE_VERSION = 1 as const;
export const DISTRIBUTION_MANDATE_CONSENT_TEXT_VERSION = "creator-distribution-mandate-v1" as const;
export const DISTRIBUTION_MANDATE_DEFAULTS = {
  enabled: true,
  destinations: ["Crayons Loop", "External OTT", "Broadcast / TV", "TVOD / EST", "FAST", "Festival / Educational", "Buyer delivery"],
  media: ["SVOD", "TVOD", "AVOD", "FAST", "BROADCAST", "THEATRICAL", "AIRLINE", "EDUCATIONAL", "FESTIVAL"],
  sublicensingAllowed: false,
} as const;
export const distributionMandateSchema = z.object({
  enabled: z.literal(true), version: z.literal(DISTRIBUTION_MANDATE_VERSION),
  destinations: z.array(z.string().min(2).max(80)).min(1).max(20),
  media: z.array(z.string().min(2).max(40)).min(1).max(20),
  acceptedAt: z.string().datetime(), consentTextVersion: z.literal(DISTRIBUTION_MANDATE_CONSENT_TEXT_VERSION),
  sublicensingAllowed: z.literal(false),
});
export type CreatorDistributionMandate = z.infer<typeof distributionMandateSchema>;
export function createDefaultDistributionMandate(acceptedAt: string): CreatorDistributionMandate {
  return distributionMandateSchema.parse({ ...DISTRIBUTION_MANDATE_DEFAULTS, version: DISTRIBUTION_MANDATE_VERSION, acceptedAt, consentTextVersion: DISTRIBUTION_MANDATE_CONSENT_TEXT_VERSION });
}
function normalizedScopeValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}
export function isDestinationCovered(mandate: CreatorDistributionMandate, requestedDestinations: readonly string[]): boolean {
  const allowed = new Set(mandate.destinations.map(normalizedScopeValue));
  return requestedDestinations.every((value) => allowed.has(normalizedScopeValue(value)));
}
export function isMediaCovered(mandate: CreatorDistributionMandate, requestedMedia: readonly string[]): boolean {
  const allowed = new Set(mandate.media.map(normalizedScopeValue));
  return requestedMedia.every((value) => allowed.has(normalizedScopeValue(value)));
}
export function canSublicenseWithinMandate(mandate: CreatorDistributionMandate, titleGrantAllowsSublicensing: boolean): boolean {
  return mandate.enabled && titleGrantAllowsSublicensing && mandate.sublicensingAllowed;
}
export async function acceptDistributionMandate(sql: Sql, userId: string) {
  const existing = await sql<{ mandate_version: number; status: string }>`
    select mandate_version, status from bridge_creator_distribution_mandates
    where creator_user_id = ${userId} order by mandate_version desc limit 1 for update
  `;
  if (existing[0]) {
    if (existing[0].status === "ACTIVE") return { accepted: true, created: false };
    throw new Error("This account-level mandate is not active. A Super Admin review is required.");
  }
  const mandate = createDefaultDistributionMandate(new Date().toISOString());
  const inserted = await sql<{ mandate_version: number }>`
    insert into bridge_creator_distribution_mandates
      (creator_user_id, mandate_version, status, scope, accepted_at, consent_text_version)
    values (${userId}, ${mandate.version}, 'ACTIVE', ${JSON.stringify(mandate)}::jsonb, ${mandate.acceptedAt}, ${mandate.consentTextVersion})
    on conflict (creator_user_id, mandate_version) do nothing returning mandate_version
  `;
  if (inserted.length === 0) {
    const raced = await sql<{ status: string }>`
      select status from bridge_creator_distribution_mandates where creator_user_id = ${userId}
      order by mandate_version desc limit 1
    `;
    if (raced[0]?.status === "ACTIVE") return { accepted: true, created: false };
    throw new Error("Distribution Mandate acceptance could not be recorded. Please retry.");
  }
  await writeAudit({
    actorUserId: userId, action: "creator.distribution_mandate.accepted",
    entityType: "bridge_creator_distribution_mandate", entityId: userId,
    metadata: { mandateVersion: mandate.version, consentTextVersion: mandate.consentTextVersion, acceptedAt: mandate.acceptedAt, destinations: mandate.destinations, media: mandate.media, sublicensingAllowed: mandate.sublicensingAllowed },
  }, sql);
  return { accepted: true, created: true };
}
export async function requireActiveDistributionMandate(
  sql: Sql, actor: { userId: string; accountType: string; internalRole?: string | null },
  requested?: { destinations?: readonly string[]; media?: readonly string[]; sublicensingRequested?: boolean },
): Promise<CreatorDistributionMandate | null> {
  if (actor.internalRole || actor.accountType === "buyer") return null;
  if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") throw new Error("This account cannot submit rights-holder distribution requests.");
  const rows = await sql<{ status: string; scope: unknown }>`
    select status, scope from bridge_creator_distribution_mandates
    where creator_user_id = ${actor.userId} order by mandate_version desc limit 1
  `;
  const row = rows[0];
  if (!row || row.status !== "ACTIVE") throw new Error("An active Creator Distribution Mandate is required before submitting to Bridge.");
  const mandate = distributionMandateSchema.parse(row.scope);
  if (requested?.destinations?.length && !isDestinationCovered(mandate, requested.destinations)) throw new Error("The requested distribution destination is outside your account mandate.");
  if (requested?.media?.length && !isMediaCovered(mandate, requested.media)) throw new Error("The requested media type is outside your account mandate.");
  if (requested?.sublicensingRequested && !canSublicenseWithinMandate(mandate, true)) throw new Error("Sublicensing is not authorized by the account mandate.");
  return mandate;
}
