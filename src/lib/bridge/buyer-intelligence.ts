import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireVerifiedActor, isPrivateBridgeOperator } from "@/lib/bridge/session";
import { assertNotDevUser } from "@/lib/bridge/guards";

const STAGING_PROJECT_REF = "jbymleftneggcgutlcqu";

type BuyerAccount = {
  id: string;
  organization_name: string;
  buyer_name: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  account_status: string;
  updated_at: string;
};

type BuyerRequirement = {
  id: string;
  buyer_account_id: string;
  requirement_key: string;
  requirement_status: string;
  content_types: string[];
  languages: string[];
  genres: string[];
  territories: string[];
  rights_types: string[];
  platforms: string[];
  commercial_models: string[];
  technical_specs: Record<string, unknown>;
  exclusions: string[];
  requirement_summary: string;
  confidence: number;
  last_mail_at: string | null;
  updated_at: string;
};

type BuyerEvidence = {
  id: string;
  buyer_requirement_id: string;
  source_uid: string;
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  extracted_excerpt: string | null;
  extraction_notes: string | null;
};

type CatalogueTitle = {
  id: string;
  name: string;
  language: string | null;
  content_type: string | null;
  status: string;
  runtime_minutes: number | null;
};

function getStagingAdminClient() {
  const rawUrl = process.env.BRIDGE_BUYER_INTELLIGENCE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.BRIDGE_BUYER_INTELLIGENCE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !serviceRoleKey) {
    return { client: null, reason: "STAGING_SERVICE_CREDENTIALS_NOT_CONFIGURED" as const };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { client: null, reason: "STAGING_URL_INVALID" as const };
  }

  // Fail closed: this feature is intentionally pinned to the approved Testing DB.
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${STAGING_PROJECT_REF}.supabase.co`
  ) {
    return { client: null, reason: "STAGING_PROJECT_MISMATCH" as const };
  }

  return {
    client: createClient(rawUrl.replace(/\/+$/, ""), serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    reason: null,
  };
}

function assertSuperAdmin(userId: string) {
  assertNotDevUser(userId);
}

function normal(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en") : "";
}

function overlap(required: string[], actual: string | null | undefined) {
  if (!required.length) return true;
  const candidate = normal(actual);
  return Boolean(candidate && required.some((item) => normal(item) === candidate));
}

function assessTitle(requirement: BuyerRequirement, title: CatalogueTitle) {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const languageFit = overlap(requirement.languages, title.language);
  const typeFit = overlap(requirement.content_types, title.content_type);

  if (!languageFit) blockers.push("Language does not match the buyer requirement.");
  else if (requirement.languages.length) reasons.push(`Language match: ${title.language}.`);

  if (!typeFit) blockers.push("Content type does not match the buyer requirement.");
  else if (requirement.content_types.length) reasons.push(`Content type match: ${title.content_type}.`);

  if (!requirement.languages.length && !requirement.content_types.length) {
    blockers.push("Buyer has not supplied enough title-level requirements for a reliable match.");
  }

  // Rights, QC, legal approval, and delivery-package checks are deliberately
  // fail-closed until their evidence is loaded and verified by the same server.
  blockers.push("Rights, territory, legal approval, QC and delivery readiness are not yet verified by this matching view.");

  const fitScore = (languageFit ? 35 : 0) + (typeFit ? 25 : 0);
  const matchStatus =
    !languageFit || !typeFit
      ? "no_match"
      : "rights_blocked";

  return {
    titleId: title.id,
    titleName: title.name,
    titleStatus: title.status,
    matchStatus,
    fitScore,
    reasons,
    blockers,
  };
}

export const getBuyerIntelligenceDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertSuperAdmin(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isPrivateBridgeOperator(actor)) throw new Error("Super admin access required");

    const configured = getStagingAdminClient();
    if (!configured.client) {
      return {
        status: "STAGING_CONNECTION_BLOCKED",
        reason: configured.reason,
        mailboxStatus: "NOT_CONFIGURED",
        metrics: { buyers: 0, requirements: 0, evidence: 0, potentialMatches: 0, rightsBlocked: 0 },
        buyers: [],
        requirements: [],
        matches: [],
        catalogueCount: null,
      };
    }

    const db = configured.client;
    const [accountsResult, requirementsResult, titlesResult] = await Promise.all([
      db.schema("bridge_private").from("buyer_accounts")
        .select("id,organization_name,buyer_name,primary_contact_name,primary_contact_email,account_status,updated_at")
        .order("updated_at", { ascending: false }),
      db.schema("bridge_private").from("buyer_requirements")
        .select("id,buyer_account_id,requirement_key,requirement_status,content_types,languages,genres,territories,rights_types,platforms,commercial_models,technical_specs,exclusions,requirement_summary,confidence,last_mail_at,updated_at")
        .order("updated_at", { ascending: false }),
      db.from("bridge_titles")
        .select("id,name,language,content_type,status,runtime_minutes")
        .order("updated_at", { ascending: false })
        .limit(250),
    ]);

    const error = accountsResult.error ?? requirementsResult.error ?? titlesResult.error;
    if (error) {
      console.error("[buyer-intelligence] staging read failed", { code: error.code, message: error.message });
      return {
        status: "STAGING_READ_FAILED",
        reason: "STAGING_DATA_READ_FAILED",
        mailboxStatus: "NOT_CONFIGURED",
        metrics: { buyers: 0, requirements: 0, evidence: 0, potentialMatches: 0, rightsBlocked: 0 },
        buyers: [],
        requirements: [],
        matches: [],
        catalogueCount: null,
      };
    }

    const buyers = (accountsResult.data ?? []) as BuyerAccount[];
    const requirements = (requirementsResult.data ?? []) as BuyerRequirement[];
    const titles = (titlesResult.data ?? []) as CatalogueTitle[];

    const requirementIds = requirements.map((item) => item.id);
    let evidence: BuyerEvidence[] = [];
    if (requirementIds.length) {
      const evidenceResult = await db.schema("bridge_private")
        .from("buyer_requirement_evidence")
        .select("id,buyer_requirement_id,source_uid,subject,sender,received_at,extracted_excerpt,extraction_notes")
        .in("buyer_requirement_id", requirementIds)
        .order("received_at", { ascending: false });
      if (evidenceResult.error) {
        console.error("[buyer-intelligence] evidence read failed", { code: evidenceResult.error.code });
      } else {
        evidence = (evidenceResult.data ?? []) as BuyerEvidence[];
      }
    }

    const matches = requirements.flatMap((requirement) =>
      titles.map((title) => ({
        requirementId: requirement.id,
        buyerName: buyers.find((buyer) => buyer.id === requirement.buyer_account_id)?.organization_name ?? "Unknown buyer",
        ...assessTitle(requirement, title),
      })),
    );

    return {
      status: "STAGING_CONNECTED",
      reason: null,
      mailboxStatus: "NOT_CONFIGURED",
      metrics: {
        buyers: buyers.length,
        requirements: requirements.length,
        evidence: evidence.length,
        potentialMatches: matches.filter((item) => item.matchStatus === "potential" || item.matchStatus === "partial").length,
        rightsBlocked: matches.filter((item) => item.matchStatus === "rights_blocked").length,
      },
      buyers,
      requirements: requirements.map((requirement) => ({
        ...requirement,
        buyer: buyers.find((buyer) => buyer.id === requirement.buyer_account_id) ?? null,
        evidence: evidence.filter((item) => item.buyer_requirement_id === requirement.id),
      })),
      matches,
      catalogueCount: titles.length,
    };
  });

export const getBuyerMailSyncReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertSuperAdmin(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isPrivateBridgeOperator(actor)) throw new Error("Super admin access required");

    // Hostinger Mail's ChatGPT connector is not an application credential.
    // The app must be explicitly provisioned with a supported mail API/IMAP
    // integration before it can poll or ingest mailbox messages.
    const configured =
      Boolean(process.env.HOSTINGER_MAIL_SYNC_ENDPOINT?.trim()) &&
      Boolean(process.env.HOSTINGER_MAIL_SYNC_TOKEN?.trim());

    return {
      status: configured ? "CONNECTOR_CONFIGURED_NOT_VERIFIED" : "NOT_CONFIGURED",
      canSync: false,
      detail: configured
        ? "Connector credentials are present, but a supported Hostinger sync adapter and end-to-end mailbox test are still required."
        : "Hostinger Mail application credentials and a supported sync adapter are not configured. No mailbox polling has been attempted.",
    };
  });

export const requestBuyerMailSync = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ confirmNoOutbound: z.literal(true) }))
  .handler(async ({ context }) => {
    assertSuperAdmin(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!isPrivateBridgeOperator(actor)) throw new Error("Super admin access required");
    return {
      status: "BLOCKED",
      reason: "HOSTINGER_SYNC_ADAPTER_NOT_IMPLEMENTED",
      message: "No mailbox read was attempted. Configure and verify a supported Hostinger Mail API/IMAP adapter before enabling sync.",
      outboundMailSent: false,
    };
  });
