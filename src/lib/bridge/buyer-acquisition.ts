import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import type { BridgeActor } from "./session";
import {
  authorizePlatformBuyerAcquisition,
  type AcquisitionRights,
  type BuyerMandate,
  type BuyerOrganization,
} from "./buyer-mandate-policy";

function requireLegalReviewer(actor: BridgeActor) {
  if (!actor.internalRole || !["legal_reviewer", "admin", "super_admin"].includes(actor.internalRole)) {
    throw new Error("Legal reviewer permission required");
  }
}

async function buyerOrganizationFor(actor: BridgeActor) {
  if (actor.accountType !== "buyer") throw new Error("Buyer account required");
  const sql = await getSql();
  const rows = await sql<{
    organization_id: string;
    legal_name: string;
    organization_status: string;
    buyer_kind: BuyerOrganization["kind"];
    verification_status: BuyerOrganization["verificationStatus"];
  }>`
    select o.id as organization_id, o.legal_name, o.status as organization_status,
      v.buyer_kind, v.verification_status
    from bridge_profiles p
    join bridge_organizations o on o.id = p.organization_id and o.status = 'active'
    join bridge_organization_memberships m
      on m.organization_id = o.id and m.user_id = p.user_id and m.status = 'active'
    left join bridge_private.buyer_organization_verifications v on v.organization_id = o.id
    where p.user_id = ${actor.userId} and p.account_type = 'buyer'
    limit 2
  `;
  if (rows.length !== 1) throw new Error("An active buyer organization membership is required");
  return { ...rows[0], sql };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return [];
  return value.map((item) => item.trim());
}

export async function assertVerifiedBuyerOrganization(actor: BridgeActor) {
  const org = await buyerOrganizationFor(actor);
  if (org.verification_status !== "verified" || !org.buyer_kind) {
    throw new Error("Buyer legal organization verification is required");
  }
  const evidence = await org.sql<{ evidence_kind: string; count: number }>`
    select evidence_kind, count(*)::int as count
    from bridge_private.buyer_organization_verification_evidence
    where organization_id = ${org.organization_id} and review_status = 'accepted'
    group by evidence_kind
  `;
  const kinds = new Set(evidence.filter((r) => r.count > 0).map((r) => r.evidence_kind));
  if (!kinds.has("company_registration") && !kinds.has("tax_registration")) {
    throw new Error("Accepted company or tax registration evidence is required");
  }
  if (!kinds.has("authorized_signatory") && !kinds.has("board_resolution")) {
    throw new Error("Accepted signatory or board authorization evidence is required");
  }
  return { organizationId: org.organization_id, legalName: org.legal_name, buyerKind: org.buyer_kind };
}

/**
 * Enforce the legal buyer mandate against title rights before order creation and
 * again immediately before entitlement creation. Missing or ambiguous scope denies.
 */
export async function assertBuyerAcquisitionAuthorization(actor: BridgeActor, titleId: string, packageId?: string | null) {
  const verified = await assertVerifiedBuyerOrganization(actor);
  const sql = await getSql();
  if (packageId) {
    // language_right_ids are identifiers, not canonical language codes. Until a
    // server-side mapping exists, do not infer package language authority.
    throw new Error("Package acquisition is blocked until package language scope is mapped to canonical language codes");
  }

  const mandates = await sql<{
    id: string;
    status: string;
    effective_from: string | Date | null;
    effective_until: string | Date | null;
    platform_account_id: string;
    platform_channel_id: string | null;
    territory_codes: unknown;
    language_codes: unknown;
    media_rights: unknown;
    exploitation_models: unknown;
    exclusivity: string;
    sublicensing_allowed: boolean;
    onward_delegation_allowed: boolean;
  }>`
    select id,status,effective_from,effective_until,platform_account_id,platform_channel_id,
      territory_codes,language_codes,media_rights,exploitation_models,exclusivity,
      sublicensing_allowed,onward_delegation_allowed
    from bridge_private.buyer_acquisition_mandates
    where buyer_organization_id = ${verified.organizationId}
      and lower(platform_code) = 'youtube'
      and status = 'approved'
      and revoked_at is null
      and effective_from <= now()
      and effective_until > now()
    order by created_at desc
    limit 2
  `;
  if (mandates.length !== 1) throw new Error("Exactly one active approved YouTube acquisition mandate is required");
  const mandateRow = mandates[0];
  if (!mandateRow.platform_account_id.trim() || !mandateRow.platform_channel_id?.trim()) {
    throw new Error("Verified YouTube platform account and channel identity are required");
  }
  const mandateEvidence = await sql<{ evidence_kind: string; count: number }>`
    select evidence_kind,count(*)::int as count
    from bridge_private.buyer_acquisition_mandate_evidence
    where mandate_id = ${mandateRow.id} and review_status = 'accepted'
    group by evidence_kind
  `;
  const evidenceKinds = new Set(mandateEvidence.filter((r) => r.count > 0).map((r) => r.evidence_kind));
  for (const required of ["signed_agreement", "channel_ownership", "territory_schedule", "rights_schedule"]) {
    if (!evidenceKinds.has(required)) throw new Error(`Accepted ${required} evidence is required for this mandate`);
  }

  const grants = await sql<{
    grant_type: string | null;
    territories: unknown;
    languages: unknown;
    media: unknown;
    window_start: string | Date | null;
    window_end: string | Date | null;
    exclusivity: string | null;
    sublicensing_allowed: boolean;
  }>`
    select grant_type,territories,languages,media,window_start,window_end,exclusivity,sublicensing_allowed
    from bridge_rights_grants
    where title_id = ${titleId} and status = 'VALID'
    order by created_at desc
    limit 20
  `;
  const intake = await sql<{ buyer_channels: unknown }>`
    select buyer_channels from bridge_title_submission_intake where title_id = ${titleId} limit 1
  `;
  const buyerChannels = stringArray(intake[0]?.buyer_channels);
  if (!buyerChannels.some((v) => v.toLowerCase() === "youtube")) {
    throw new Error("Title rights intake does not explicitly authorize YouTube as a buyer channel");
  }

  const organization: BuyerOrganization = {
    kind: verified.buyerKind,
    verificationStatus: "verified",
  };
  const mandate: BuyerMandate = {
    status: "verified",
    effectiveFrom: mandateRow.effective_from ? new Date(mandateRow.effective_from).toISOString() : null,
    effectiveUntil: mandateRow.effective_until ? new Date(mandateRow.effective_until).toISOString() : null,
    channels: ["YouTube"],
    territories: stringArray(mandateRow.territory_codes),
    languages: stringArray(mandateRow.language_codes),
    mediaRights: stringArray(mandateRow.media_rights),
    exploitationModels: stringArray(mandateRow.exploitation_models),
    exclusivity: mandateRow.exclusivity as "exclusive" | "non_exclusive",
    sublicensingAllowed: mandateRow.sublicensing_allowed,
    onwardDelegationAllowed: mandateRow.onward_delegation_allowed,
  };
  if (!grants.length) throw new Error("An active, legally approved title rights grant is required");
  let authorized = false;
  for (const grant of grants) {
    const territories = stringArray(grant.territories);
    const languages = stringArray(grant.languages);
    const media = stringArray(grant.media);
    if (!grant.grant_type || !territories.length || !languages.length || !media.length ||
        !grant.window_start || !grant.window_end) continue;
    const exclusivity = (grant.exclusivity ?? "").toUpperCase() === "EXCLUSIVE";
    const rightsWindow = {
      startsAt: new Date(grant.window_start).toISOString(),
      endsAt: new Date(grant.window_end).toISOString(),
    };
    const combinations = territories.flatMap((territory) =>
      languages.flatMap((language) => media.map((mediaRight) => ({
        territory, language, mediaRight,
      }))),
    );
    const valid = combinations.every(({ territory, language, mediaRight }) => {
      const rights: AcquisitionRights = {
        channel: "YouTube",
        territory,
        language,
        mediaRight,
        exploitationModel: grant.grant_type!,
        exclusive: exclusivity,
        requiresSublicensing: grant.sublicensing_allowed,
        requiresOnwardDelegation: false,
        ...rightsWindow,
      };
      return authorizePlatformBuyerAcquisition({ organization, mandate, rights }).allowed;
    });
    if (valid) { authorized = true; break; }
  }
  if (!authorized) throw new Error("No active title rights grant fits the verified YouTube mandate scope");
  return { organizationId: verified.organizationId, mandateId: mandateRow.id };
}

export const submitBuyerOrganizationVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    buyerKind: z.enum(["buyer", "platform_buyer", "distributor", "aggregator"]),
    legalRegistrationCountry: z.string().trim().min(2).max(80),
    legalRegistrationNumber: z.string().trim().min(2).max(160),
    officialWebsite: z.string().url().max(500).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const org = await buyerOrganizationFor(actor);
    const rows = await org.sql`
      insert into bridge_private.buyer_organization_verifications
        (organization_id,buyer_kind,verification_status,legal_registration_country,legal_registration_number,official_website,submitted_by,submitted_at,reviewed_by,reviewed_at,review_notes,updated_at)
      values (${org.organization_id},${data.buyerKind},'pending_review',${data.legalRegistrationCountry},${data.legalRegistrationNumber},${data.officialWebsite ?? null},${actor.userId},now(),null,null,null,now())
      on conflict (organization_id) do update set
        buyer_kind=excluded.buyer_kind,verification_status='pending_review',
        legal_registration_country=excluded.legal_registration_country,
        legal_registration_number=excluded.legal_registration_number,
        official_website=excluded.official_website,submitted_by=excluded.submitted_by,
        submitted_at=now(),reviewed_by=null,reviewed_at=null,review_notes=null,updated_at=now()
      where buyer_organization_verifications.verification_status <> 'verified'
      returning organization_id
    `;
    if (!rows.length) throw new Error("Verified buyer organization cannot be silently resubmitted");
    await org.sql`update bridge_private.buyer_organization_verification_evidence
      set review_status='pending',reviewed_by=null,reviewed_at=null,review_notes=null
      where organization_id=${org.organization_id}`;
    await writeAudit({ actorUserId: actor.userId, action: "buyer.organization_verification.submitted", entityType: "buyer_organization", entityId: org.organization_id, metadata: { buyerKind: data.buyerKind } });
    return { ok: true, status: "pending_review" as const };
  });

export const submitBuyerAcquisitionMandate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    platformAccountId: z.string().trim().min(2).max(200),
    platformChannelId: z.string().trim().min(2).max(200),
    territoryCodes: z.array(z.string().trim().min(2).max(12)).min(1).max(250),
    languageCodes: z.array(z.string().trim().min(2).max(40)).min(1).max(50),
    mediaRights: z.array(z.string().trim().min(2).max(80)).min(1).max(50),
    exploitationModels: z.array(z.string().trim().min(2).max(80)).min(1).max(50),
    exclusivity: z.enum(["exclusive", "non_exclusive"]),
    sublicensingAllowed: z.boolean(),
    onwardDelegationAllowed: z.boolean(),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime(),
    agreementReference: z.string().trim().min(2).max(500),
  }).superRefine((data, ctx) => {
    if (new Date(data.effectiveUntil) <= new Date(data.effectiveFrom)) ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "Mandate end must be after start" });
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const verified = await assertVerifiedBuyerOrganization(actor);
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      insert into bridge_private.buyer_acquisition_mandates
        (buyer_organization_id,platform_code,platform_account_id,platform_channel_id,status,
         territory_codes,language_codes,media_rights,exploitation_models,exclusivity,
         sublicensing_allowed,onward_delegation_allowed,effective_from,effective_until,
         agreement_reference,created_by)
      values (${verified.organizationId},'youtube',${data.platformAccountId},${data.platformChannelId},'pending_review',
        ${data.territoryCodes}::text[],${data.languageCodes}::text[],
        ${data.mediaRights}::text[],${data.exploitationModels}::text[],
        ${data.exclusivity},${data.sublicensingAllowed},${data.onwardDelegationAllowed},
        ${data.effectiveFrom},${data.effectiveUntil},${data.agreementReference},${actor.userId})
      returning id
    `;
    if (!rows[0]) throw new Error("Mandate submission failed");
    await writeAudit({ actorUserId: actor.userId, action: "buyer.acquisition_mandate.submitted", entityType: "buyer_acquisition_mandate", entityId: rows[0].id, metadata: { platform: "youtube" } });
    return { mandateId: rows[0].id, status: "pending_review" as const };
  });

export const listBuyerComplianceQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireLegalReviewer(actor);
    const sql = await getSql();
    const [organizations, mandates, organizationEvidence, mandateEvidence] = await Promise.all([
      sql<{ organization_id: string; legal_name: string; buyer_kind: string; verification_status: string; legal_registration_country: string | null; legal_registration_number: string | null; official_website: string | null; submitted_by: string; submitted_at: string; reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null }>`select v.organization_id,o.legal_name,v.buyer_kind,v.verification_status,v.legal_registration_country,v.legal_registration_number,v.official_website,v.submitted_by,v.submitted_at::text,v.reviewed_by,v.reviewed_at::text,v.review_notes from bridge_private.buyer_organization_verifications v join bridge_organizations o on o.id=v.organization_id where v.verification_status='pending_review' order by v.submitted_at asc limit 100`,
      sql<{ id: string; buyer_organization_id: string; legal_name: string; platform_code: string; platform_account_id: string; platform_channel_id: string | null; status: string; territory_codes: string[]; language_codes: string[]; media_rights: string[]; exploitation_models: string[]; exclusivity: string; sublicensing_allowed: boolean; onward_delegation_allowed: boolean; effective_from: string | null; effective_until: string | null; agreement_reference: string | null; created_by: string; reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null; created_at: string; revoked_at: string | null }>`select m.id,m.buyer_organization_id,o.legal_name,m.platform_code,m.platform_account_id,m.platform_channel_id,m.status,m.territory_codes,m.language_codes,m.media_rights,m.exploitation_models,m.exclusivity,m.sublicensing_allowed,m.onward_delegation_allowed,m.effective_from::text,m.effective_until::text,m.agreement_reference,m.created_by,m.reviewed_by,m.reviewed_at::text,m.review_notes,m.created_at::text,m.revoked_at::text from bridge_private.buyer_acquisition_mandates m join bridge_organizations o on o.id=m.buyer_organization_id where m.status='pending_review' order by m.created_at asc limit 100`,
      sql<{ id: string; organization_id: string; evidence_kind: string; storage_object_path: string; sha256_hex: string | null; uploaded_by: string; uploaded_at: string; review_status: string; reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null }>`select e.id,e.organization_id,e.evidence_kind,e.storage_object_path,e.sha256_hex,e.uploaded_by,e.uploaded_at::text,e.review_status,e.reviewed_by,e.reviewed_at::text,e.review_notes from bridge_private.buyer_organization_verification_evidence e join bridge_private.buyer_organization_verifications v on v.organization_id=e.organization_id where v.verification_status='pending_review' order by e.uploaded_at asc limit 300`,
      sql<{ id: string; mandate_id: string; evidence_kind: string; storage_object_path: string; sha256_hex: string | null; uploaded_by: string; uploaded_at: string; review_status: string; reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null }>`select e.id,e.mandate_id,e.evidence_kind,e.storage_object_path,e.sha256_hex,e.uploaded_by,e.uploaded_at::text,e.review_status,e.reviewed_by,e.reviewed_at::text,e.review_notes from bridge_private.buyer_acquisition_mandate_evidence e join bridge_private.buyer_acquisition_mandates m on m.id=e.mandate_id where m.status='pending_review' order by e.uploaded_at asc limit 300`,
    ]);
    return { organizations, mandates, organizationEvidence, mandateEvidence };
  });

export const reviewBuyerOrganizationVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ organizationId: z.string().uuid(), decision: z.enum(["approve", "reject", "suspend"]), notes: z.string().trim().min(8).max(4000) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireLegalReviewer(actor);
    const sql = await getSql();
    const submitted = await sql<{ submitted_by: string }>`select submitted_by from bridge_private.buyer_organization_verifications where organization_id=${data.organizationId} and verification_status='pending_review' limit 1`;
    if (!submitted[0] || submitted[0].submitted_by === actor.userId) throw new Error("Independent legal reviewer required");
    const accepted = await sql<{ evidence_kind: string }>`select evidence_kind from bridge_private.buyer_organization_verification_evidence where organization_id=${data.organizationId} and review_status='accepted'`;
    const kinds = new Set(accepted.map((r) => r.evidence_kind));
    if (data.decision === "approve" && ((!kinds.has("company_registration") && !kinds.has("tax_registration")) || (!kinds.has("authorized_signatory") && !kinds.has("board_resolution")))) throw new Error("Required legal identity evidence must be accepted before approval");
    const status = data.decision === "approve" ? "verified" : data.decision === "reject" ? "rejected" : "suspended";
    await sql`update bridge_private.buyer_organization_verifications set verification_status=${status},reviewed_by=${actor.userId},reviewed_at=now(),review_notes=${data.notes},updated_at=now() where organization_id=${data.organizationId}`;
    await writeAudit({ actorUserId: actor.userId, action: `buyer.organization_verification.${data.decision}`, entityType: "buyer_organization", entityId: data.organizationId, metadata: { notes: data.notes } });
    return { ok: true, status };
  });

export const reviewBuyerAcquisitionMandate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ mandateId: z.string().uuid(), decision: z.enum(["approve", "reject", "suspend"]), notes: z.string().trim().min(8).max(4000) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireLegalReviewer(actor);
    const sql = await getSql();
    const rows = await sql<{ created_by: string; buyer_organization_id: string; effective_from: string | Date; effective_until: string | Date }>`
      select m.created_by,m.buyer_organization_id,m.effective_from,m.effective_until
      from bridge_private.buyer_acquisition_mandates m
      join bridge_private.buyer_organization_verifications v on v.organization_id=m.buyer_organization_id and v.verification_status='verified'
      where m.id=${data.mandateId} and m.status='pending_review' limit 1
    `;
    if (!rows[0] || rows[0].created_by === actor.userId) throw new Error("Verified organization and independent legal reviewer required");
    const accepted = await sql<{ evidence_kind: string }>`select evidence_kind from bridge_private.buyer_acquisition_mandate_evidence where mandate_id=${data.mandateId} and review_status='accepted'`;
    const kinds = new Set(accepted.map((r) => r.evidence_kind));
    if (data.decision === "approve") {
      for (const required of ["signed_agreement", "channel_ownership", "territory_schedule", "rights_schedule"]) if (!kinds.has(required)) throw new Error(`Accepted ${required} evidence is required`);
      if (new Date(rows[0].effective_until) <= new Date() || new Date(rows[0].effective_until) <= new Date(rows[0].effective_from)) throw new Error("Mandate must have a valid, unexpired effective period");
    }
    const status = data.decision === "approve" ? "approved" : data.decision === "reject" ? "rejected" : "suspended";
    await sql`update bridge_private.buyer_acquisition_mandates set status=${status},reviewed_by=${actor.userId},reviewed_at=now(),review_notes=${data.notes},updated_at=now() where id=${data.mandateId}`;
    await writeAudit({ actorUserId: actor.userId, action: `buyer.acquisition_mandate.${data.decision}`, entityType: "buyer_acquisition_mandate", entityId: data.mandateId, metadata: { notes: data.notes } });
    return { ok: true, status };
  });


export const reviewBuyerComplianceEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    target: z.enum(["organization", "mandate"]),
    evidenceId: z.string().uuid(),
    decision: z.enum(["accept", "reject"]),
    notes: z.string().trim().min(8).max(4000),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireLegalReviewer(actor);
    const sql = await getSql();
    const reviewStatus = data.decision === "accept" ? "accepted" : "rejected";
    if (data.target === "organization") {
      const rows = await sql<{ uploaded_by: string; organization_id: string; parent_status: string }>`
        select e.uploaded_by,e.organization_id,v.verification_status as parent_status
        from bridge_private.buyer_organization_verification_evidence e
        join bridge_private.buyer_organization_verifications v on v.organization_id=e.organization_id
        where e.id=${data.evidenceId} limit 1
      `;
      if (!rows[0] || rows[0].uploaded_by === actor.userId || rows[0].parent_status !== "pending_review") {
        throw new Error("Pending evidence and independent reviewer on an active organization review are required");
      }
      const updated = await sql<{ id: string }>`update bridge_private.buyer_organization_verification_evidence e
        set review_status=${reviewStatus},reviewed_by=${actor.userId},reviewed_at=now(),review_notes=${data.notes}
        where e.id=${data.evidenceId} and e.review_status='pending'
          and exists (select 1 from bridge_private.buyer_organization_verifications v
            where v.organization_id=e.organization_id and v.verification_status='pending_review')
        returning e.id`;
      if (!updated[0]) throw new Error("Evidence has already been reviewed");
      await writeAudit({ actorUserId: actor.userId, action: `buyer.organization_evidence.${data.decision}`, entityType: "buyer_organization", entityId: rows[0].organization_id, metadata: { evidenceId: data.evidenceId, notes: data.notes } });
    } else {
      const rows = await sql<{ uploaded_by: string; mandate_id: string; parent_status: string }>`
        select e.uploaded_by,e.mandate_id,m.status as parent_status
        from bridge_private.buyer_acquisition_mandate_evidence e
        join bridge_private.buyer_acquisition_mandates m on m.id=e.mandate_id
        where e.id=${data.evidenceId} limit 1
      `;
      if (!rows[0] || rows[0].uploaded_by === actor.userId || rows[0].parent_status !== "pending_review") {
        throw new Error("Pending evidence and independent reviewer on an active mandate review are required");
      }
      const updated = await sql<{ id: string }>`update bridge_private.buyer_acquisition_mandate_evidence e
        set review_status=${reviewStatus},reviewed_by=${actor.userId},reviewed_at=now(),review_notes=${data.notes}
        where e.id=${data.evidenceId} and e.review_status='pending'
          and exists (select 1 from bridge_private.buyer_acquisition_mandates m
            where m.id=e.mandate_id and m.status='pending_review')
        returning e.id`;
      if (!updated[0]) throw new Error("Evidence has already been reviewed");
      await writeAudit({ actorUserId: actor.userId, action: `buyer.mandate_evidence.${data.decision}`, entityType: "buyer_acquisition_mandate", entityId: rows[0].mandate_id, metadata: { evidenceId: data.evidenceId, notes: data.notes } });
    }
    return { ok: true, reviewStatus };
  });


export const getBuyerComplianceStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const org = await buyerOrganizationFor(actor);
    const [verification, mandates] = await Promise.all([
      org.sql<{ buyer_kind: string; verification_status: string; legal_registration_country: string | null; legal_registration_number: string | null; official_website: string | null; submitted_at: string | null; reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null }>`select buyer_kind,verification_status,legal_registration_country,legal_registration_number,official_website,submitted_at::text,reviewed_by,reviewed_at::text,review_notes from bridge_private.buyer_organization_verifications where organization_id=${org.organization_id} limit 1`,
      org.sql<{ id: string; platform_code: string; platform_account_id: string; platform_channel_id: string | null; status: string; territory_codes: string[]; language_codes: string[]; media_rights: string[]; exploitation_models: string[]; exclusivity: string; sublicensing_allowed: boolean; onward_delegation_allowed: boolean; effective_from: string | null; effective_until: string | null; agreement_reference: string | null; reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null; created_at: string }>`select id,platform_code,platform_account_id,platform_channel_id,status,territory_codes,language_codes,media_rights,exploitation_models,exclusivity,sublicensing_allowed,onward_delegation_allowed,effective_from::text,effective_until::text,agreement_reference,reviewed_by,reviewed_at::text,review_notes,created_at::text from bridge_private.buyer_acquisition_mandates where buyer_organization_id=${org.organization_id} order by created_at desc limit 50`,
    ]);
    const organizationEvidence = await org.sql<{ id: string; evidence_kind: string; storage_object_path: string; sha256_hex: string | null; review_status: string; reviewed_at: string | null; review_notes: string | null }>`select id,evidence_kind,storage_object_path,sha256_hex,review_status,reviewed_at::text,review_notes from bridge_private.buyer_organization_verification_evidence where organization_id=${org.organization_id} order by uploaded_at desc limit 100`;
    const mandateEvidence = mandates.length
      ? await org.sql<{ id: string; mandate_id: string; evidence_kind: string; storage_object_path: string; sha256_hex: string | null; review_status: string; reviewed_at: string | null; review_notes: string | null }>`select e.id,e.mandate_id,e.evidence_kind,e.storage_object_path,e.sha256_hex,e.review_status,e.reviewed_at::text,e.review_notes from bridge_private.buyer_acquisition_mandate_evidence e join bridge_private.buyer_acquisition_mandates m on m.id=e.mandate_id where m.buyer_organization_id=${org.organization_id} order by e.uploaded_at desc limit 200`
      : [];
    return { organization: { id: org.organization_id, legalName: org.legal_name }, verification: verification[0] ?? null, mandates, organizationEvidence, mandateEvidence };
  });


const legalUploadInput = z.object({
  target: z.enum(["organization", "mandate"]),
  evidenceKind: z.enum(["company_registration", "tax_registration", "board_resolution", "authorized_signatory", "platform_ownership", "signed_agreement", "channel_ownership", "territory_schedule", "rights_schedule", "other"]),
  mandateId: z.string().uuid().optional(),
  filename: z.string().trim().min(1).max(120),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
});

export const requestBuyerEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(legalUploadInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const org = await buyerOrganizationFor(actor);
    const orgKinds = ["company_registration", "tax_registration", "board_resolution", "authorized_signatory", "platform_ownership", "other"];
    const mandateKinds = ["signed_agreement", "board_authorization", "power_of_attorney", "channel_ownership", "territory_schedule", "rights_schedule", "other"];
    if (data.target === "organization" && !orgKinds.includes(data.evidenceKind)) throw new Error("Evidence kind is not valid for organization verification");
    if (data.target === "mandate" && !mandateKinds.includes(data.evidenceKind)) throw new Error("Evidence kind is not valid for acquisition mandates");
    if (data.target === "mandate") {
      if (!data.mandateId) throw new Error("Mandate ID is required");
      const owned = await org.sql`select id from bridge_private.buyer_acquisition_mandates where id=${data.mandateId} and buyer_organization_id=${org.organization_id} limit 1`;
      if (!owned[0]) throw new Error("Mandate not found");
    } else {
      const verification = await org.sql`select organization_id from bridge_private.buyer_organization_verifications where organization_id=${org.organization_id} limit 1`;
      if (!verification[0]) throw new Error("Submit organization verification before uploading evidence");
    }
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
    const key = `buyer-legal/${org.organization_id}/${data.target}/${randomBytes(16).toString("hex")}-${safeName}`;
    const { signUpload } = await import("./oci-object-storage.server");
    const signed = await signUpload({ key, contentType: data.contentType, expiresIn: 900 });
    return { ...signed, objectKey: key };
  });

export const confirmBuyerEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    target: z.enum(["organization", "mandate"]),
    evidenceKind: legalUploadInput.shape.evidenceKind,
    mandateId: z.string().uuid().optional(),
    key: z.string().trim().min(8).max(1000),
    contentType: legalUploadInput.shape.contentType,
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const org = await buyerOrganizationFor(actor);
    if (!data.key.startsWith(`buyer-legal/${org.organization_id}/${data.target}/`)) throw new Error("Evidence object is outside this organization's private storage prefix");
    const orgKinds = ["company_registration", "tax_registration", "board_resolution", "authorized_signatory", "platform_ownership", "other"];
    const mandateKinds = ["signed_agreement", "board_authorization", "power_of_attorney", "channel_ownership", "territory_schedule", "rights_schedule", "other"];
    if (data.target === "organization" && !orgKinds.includes(data.evidenceKind)) throw new Error("Evidence kind is not valid for organization verification");
    if (data.target === "mandate" && !mandateKinds.includes(data.evidenceKind)) throw new Error("Evidence kind is not valid for acquisition mandates");
    const { verifyObject, sealVerifiedObject } = await import("./oci-object-storage.server");
    const object = await verifyObject(data.key, data.contentType);
    if (!Number.isSafeInteger(object.byteSize) || object.byteSize <= 0 || object.byteSize > 20 * 1024 * 1024) throw new Error("Legal evidence must be a verified non-empty file no larger than 20 MB");
    if (!object.etag) throw new Error("Legal evidence ETag is required for immutable verification");
    const sealedKey = `${data.key}.verified/${randomBytes(16).toString("hex")}`;
    const sealed = await sealVerifiedObject(data.key, sealedKey, object.etag);
    if (sealed.byteSize !== object.byteSize || !sealed.etag) throw new Error("Verified legal evidence copy differs from uploaded object");
    if (data.target === "organization") {
      const verification = await org.sql`select organization_id from bridge_private.buyer_organization_verifications where organization_id=${org.organization_id} limit 1`;
      if (!verification[0]) throw new Error("Submit organization verification before confirming evidence");
      await org.sql`insert into bridge_private.buyer_organization_verification_evidence
        (organization_id,evidence_kind,storage_object_path,uploaded_by)
        values (${org.organization_id},${data.evidenceKind},${sealedKey},${actor.userId})`;
    } else {
      if (!data.mandateId) throw new Error("Mandate ID is required");
      const owned = await org.sql`select id from bridge_private.buyer_acquisition_mandates where id=${data.mandateId} and buyer_organization_id=${org.organization_id} limit 1`;
      if (!owned[0]) throw new Error("Mandate not found");
      await org.sql`insert into bridge_private.buyer_acquisition_mandate_evidence
        (mandate_id,evidence_kind,storage_object_path,uploaded_by)
        values (${data.mandateId},${data.evidenceKind},${sealedKey},${actor.userId})`;
    }
    await writeAudit({ actorUserId: actor.userId, action: "buyer.compliance.evidence_uploaded", entityType: "buyer_organization", entityId: org.organization_id, metadata: { target: data.target, evidenceKind: data.evidenceKind, byteSize: sealed.byteSize } });
    return { ok: true, byteSize: sealed.byteSize };
  });


export const getBuyerEvidenceReviewUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ target: z.enum(["organization", "mandate"]), evidenceId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireLegalReviewer(actor);
    const sql = await getSql();
    let key: string | null = null;
    if (data.target === "organization") {
      // Reviewers may preview only evidence that is still in an active legal
      // verification queue. A known evidence UUID must not expose another
      // organization's approved/rejected records through this signed-URL API.
      const rows = await sql<{ storage_object_path: string }>`
        select e.storage_object_path
        from bridge_private.buyer_organization_verification_evidence e
        join bridge_private.buyer_organization_verifications v
          on v.organization_id = e.organization_id
        where e.id = ${data.evidenceId}
          and e.review_status = 'pending'
          and v.verification_status = 'pending_review'
        limit 1
      `;
      key = rows[0]?.storage_object_path ?? null;
    } else {
      // Mandate evidence is visible only while its parent mandate is pending.
      const rows = await sql<{ storage_object_path: string }>`
        select e.storage_object_path
        from bridge_private.buyer_acquisition_mandate_evidence e
        join bridge_private.buyer_acquisition_mandates m on m.id = e.mandate_id
        where e.id = ${data.evidenceId}
          and e.review_status = 'pending'
          and m.status = 'pending_review'
        limit 1
      `;
      key = rows[0]?.storage_object_path ?? null;
    }
    if (!key || !key.includes(".verified/")) throw new Error("Sealed legal evidence object not found");
    const { signDownload } = await import("./oci-object-storage.server");
    const signed = await signDownload({ key, expiresIn: 300 });
    await writeAudit({ actorUserId: actor.userId, action: "buyer.compliance.evidence_download_signed", entityType: "buyer_compliance_evidence", entityId: data.evidenceId, metadata: { target: data.target, expiresInSeconds: 300 } });
    return { url: signed.url, expiresInSeconds: 300 };
  });
