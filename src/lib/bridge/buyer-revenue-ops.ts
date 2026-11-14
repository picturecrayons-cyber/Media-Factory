export type BuyerAccountStatus = "UNVERIFIED" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED" | "SUSPENDED";
export type TerritoryAccessStatus = "UNCONFIRMED" | "REQUESTED" | "VERIFIED_AVAILABLE" | "NOT_AVAILABLE" | "SUSPENDED";
export type BuyerDemandStatus = "NONE" | "DISCOVERY" | "REQUESTED" | "EVALUATION" | "PILOT" | "COMMITTED" | "REJECTED" | "PAUSED";
export type BuyerContractStatus = "NONE" | "DRAFT" | "SENT" | "SIGNED" | "ACTIVE" | "EXPIRED" | "TERMINATED";
export type BuyerPaymentStatus = "NONE" | "EXPECTED" | "INVOICED" | "PARTIALLY_PAID" | "SETTLED" | "OVERDUE" | "DISPUTED" | "REFUNDED";
export type BuyerPayeeStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "BLOCKED";

export interface BuyerTerritoryAccess {
  territory: string;
  status: TerritoryAccessStatus;
  evidenceReference?: string | null;
  verifiedAt?: string | null;
}

export interface BuyerRevenueOperationsRecord {
  buyerId: string;
  buyerName: string;
  channel: string;
  accountStatus: BuyerAccountStatus;
  accountEvidenceReference?: string | null;
  accountVerifiedAt?: string | null;
  territories: BuyerTerritoryAccess[];
  demandStatus: BuyerDemandStatus;
  demandEvidenceReference?: string | null;
  demandReceivedAt?: string | null;
  contractStatus: BuyerContractStatus;
  contractEvidenceReference?: string | null;
  contractSignedAt?: string | null;
  paymentStatus: BuyerPaymentStatus;
  paymentAmountMinor?: number | null;
  paymentCurrency?: string | null;
  paymentReference?: string | null;
  paymentReconciledAt?: string | null;
  payeeStatus: BuyerPayeeStatus;
  payeeEvidenceReference?: string | null;
}

export interface BuyerRevenueReadiness {
  accountVerified: boolean;
  verifiedTerritories: string[];
  demandConfirmed: boolean;
  contractEffective: boolean;
  paymentSettled: boolean;
  payeeVerified: boolean;
  blockers: string[];
  revenueClassification: "NO_REVENUE" | "PIPELINE_ONLY" | "CONTRACTED" | "INVOICED" | "CASH_RECEIVED";
}

/**
 * Computes evidence-backed commercial readiness. This function is deliberately
 * fail-closed: a status label without its supporting evidence is not proof.
 * It never creates a buyer, grants rights, sends an offer, or records a payment.
 */
export function assessBuyerRevenueReadiness(
  record: BuyerRevenueOperationsRecord,
): BuyerRevenueReadiness {
  const blockers: string[] = [];
  const accountVerified =
    record.accountStatus === "VERIFIED" &&
    Boolean(record.accountEvidenceReference?.trim()) &&
    isValidTimestamp(record.accountVerifiedAt);
  if (!accountVerified) blockers.push("BUYER_ACCOUNT_NOT_VERIFIED");

  const verifiedTerritories = record.territories
    .filter(
      (territory) =>
        territory.status === "VERIFIED_AVAILABLE" &&
        Boolean(territory.evidenceReference?.trim()) &&
        isValidTimestamp(territory.verifiedAt),
    )
    .map((territory) => territory.territory.trim().toUpperCase())
    .filter(Boolean);
  if (verifiedTerritories.length === 0) blockers.push("NO_VERIFIED_TERRITORY");

  const demandConfirmed =
    ["REQUESTED", "EVALUATION", "PILOT", "COMMITTED"].includes(record.demandStatus) &&
    Boolean(record.demandEvidenceReference?.trim()) &&
    isValidTimestamp(record.demandReceivedAt);
  if (!demandConfirmed) blockers.push("NO_EVIDENCED_BUYER_DEMAND");

  const contractEffective =
    ["SIGNED", "ACTIVE"].includes(record.contractStatus) &&
    Boolean(record.contractEvidenceReference?.trim()) &&
    isValidTimestamp(record.contractSignedAt);
  if (!contractEffective) blockers.push("NO_EXECUTED_CONTRACT");

  const paymentSettled =
    record.paymentStatus === "SETTLED" &&
    Number.isSafeInteger(record.paymentAmountMinor) &&
    Number(record.paymentAmountMinor) > 0 &&
    Boolean(record.paymentCurrency?.trim()) &&
    Boolean(record.paymentReference?.trim()) &&
    isValidTimestamp(record.paymentReconciledAt);
  if (!paymentSettled) blockers.push("CASH_NOT_RECONCILED");

  const payeeVerified =
    record.payeeStatus === "VERIFIED" &&
    Boolean(record.payeeEvidenceReference?.trim());
  if (!payeeVerified) blockers.push("PAYEE_ELIGIBILITY_NOT_VERIFIED");

  let revenueClassification: BuyerRevenueReadiness["revenueClassification"] = "NO_REVENUE";
  if (demandConfirmed) revenueClassification = "PIPELINE_ONLY";
  if (contractEffective) revenueClassification = "CONTRACTED";
  if (record.paymentStatus === "INVOICED" && contractEffective) {
    revenueClassification = "INVOICED";
  }
  // Recognize revenue only after the complete buyer path is evidenced.
  // A settled payment record must not bypass verified account, territory, or
  // explicit demand evidence (which are independent commercial prerequisites).
  if (
    accountVerified &&
    verifiedTerritories.length > 0 &&
    demandConfirmed &&
    contractEffective &&
    paymentSettled &&
    payeeVerified
  ) {
    revenueClassification = "CASH_RECEIVED";
  }

  return {
    accountVerified,
    verifiedTerritories,
    demandConfirmed,
    contractEffective,
    paymentSettled,
    payeeVerified,
    blockers,
    revenueClassification,
  };
}

function isValidTimestamp(value?: string | null): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}
