export type GateName = "INGEST" | "QC" | "LEGAL" | "RIGHTS" | "PACKAGE" | "AUTHORIZED";
export type GateState = "PASS" | "PENDING" | "FAILED" | "UNAVAILABLE";

export type SupplyGate = {
  state: GateState;
  detail: string;
};

export type RightsWindow = {
  status: string;
  exclusivity: string;
  territories: string[];
  languages: string[];
  media: string[];
  windowStart: string | null;
  windowEnd: string | null;
};

function listOverlaps(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return true;
  const known = new Set(left.map((value) => value.trim().toUpperCase()));
  return right.some((value) => known.has(value.trim().toUpperCase()));
}

function windowStart(grant: RightsWindow): number {
  return grant.windowStart ? new Date(grant.windowStart).getTime() : Number.NEGATIVE_INFINITY;
}

function windowEnd(grant: RightsWindow): number {
  return grant.windowEnd ? new Date(grant.windowEnd).getTime() : Number.POSITIVE_INFINITY;
}

function windowsOverlap(left: RightsWindow, right: RightsWindow): boolean {
  return windowStart(left) < windowEnd(right) && windowStart(right) < windowEnd(left);
}

/** Reject a grant that would overlap an exclusive authorization. Revoked and expired rows are ignored. */
export function exclusiveConflict(grants: RightsWindow[]): string | null {
  const active = grants.filter((grant) => grant.status === "VALID");
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i];
      const right = active[j];
      if (left.exclusivity !== "EXCLUSIVE" && right.exclusivity !== "EXCLUSIVE") continue;
      if (!windowsOverlap(left, right)) continue;
      if (!listOverlaps(left.territories, right.territories)) continue;
      if (!listOverlaps(left.languages, right.languages)) continue;
      if (!listOverlaps(left.media, right.media)) continue;
      return "Overlapping exclusive authorization";
    }
  }
  return null;
}

export function assertNoExclusiveOverlap(existing: RightsWindow[], candidate: RightsWindow): void {
  const conflict = exclusiveConflict([...existing, { ...candidate, status: "VALID" }]);
  if (conflict) throw new Error(conflict);
}

function inForce(grant: RightsWindow, now: Date): boolean {
  if (grant.status !== "VALID") return false;
  const time = now.getTime();
  return windowStart(grant) <= time && time < windowEnd(grant);
}

export function deriveSupplyGates(input: {
  recordsAvailable: boolean;
  verifiedAssetCount: number;
  qcStatus: string | null;
  legalStatus: string | null;
  rights: RightsWindow[];
  packageState: string | null;
  now?: Date;
}): Record<GateName, SupplyGate> {
  const now = input.now ?? new Date();
  const ingest: SupplyGate = input.verifiedAssetCount > 0
    ? { state: "PASS", detail: "At least one private object passed HeadObject size verification." }
    : { state: "PENDING", detail: "No HeadObject-verified asset is recorded. A signed upload is not ingest." };

  if (!input.recordsAvailable) {
    const missing = {
      state: "UNAVAILABLE" as const,
      detail: "Supply-chain tables are not recorded on this database. Lifecycle status is not a substitute.",
    };
    return {
      INGEST: ingest,
      QC: missing,
      LEGAL: missing,
      RIGHTS: missing,
      PACKAGE: missing,
      AUTHORIZED: missing,
    };
  }

  const qc: SupplyGate = !input.qcStatus
    ? { state: "UNAVAILABLE", detail: "No technical QC case is recorded." }
    : input.qcStatus === "PASSED" || input.qcStatus === "WARNING"
      ? { state: "PASS", detail: `Technical QC ${input.qcStatus}.` }
      : input.qcStatus === "FAILED" || input.qcStatus === "ACTION_REQUIRED"
        ? { state: "FAILED", detail: `Technical QC ${input.qcStatus}.` }
        : { state: "PENDING", detail: `Technical QC ${input.qcStatus}.` };

  const legal: SupplyGate = !input.legalStatus
    ? { state: "UNAVAILABLE", detail: "No legal approval case is recorded. QC does not clear legal." }
    : input.legalStatus === "APPROVED"
      ? { state: "PASS", detail: "Legal approval recorded." }
      : input.legalStatus === "REJECTED" || input.legalStatus === "ACTION_REQUIRED"
        ? { state: "FAILED", detail: `Legal case ${input.legalStatus}.` }
        : { state: "PENDING", detail: `Legal case ${input.legalStatus}.` };

  const conflict = exclusiveConflict(input.rights);
  const validNow = input.rights.some((grant) => inForce(grant, now));
  const rights: SupplyGate = conflict
    ? { state: "FAILED", detail: conflict }
    : input.rights.length === 0
      ? { state: "UNAVAILABLE", detail: "No rights grant is recorded." }
      : validNow
        ? { state: "PASS", detail: "A current valid grant is recorded." }
        : { state: "PENDING", detail: "Rights exist but none are currently valid." };

  const separated = qc.state === "PASS" && legal.state === "PASS" && rights.state === "PASS";
  const packageState = input.packageState;
  const packaged: SupplyGate = !separated
    ? { state: "UNAVAILABLE", detail: "A destination package cannot be ready until QC, legal and rights each pass separately." }
    : packageState === "READY" || packageState === "AUTHORIZED" || packageState === "DELIVERED"
      ? { state: "PASS", detail: `Package ${packageState}.` }
      : packageState === "REVOKED"
        ? { state: "FAILED", detail: "Package revoked." }
        : packageState
          ? { state: "PENDING", detail: `Package ${packageState}.` }
          : { state: "UNAVAILABLE", detail: "No destination package version is recorded." };

  const authorized: SupplyGate = packageState === "AUTHORIZED" || packageState === "DELIVERED"
    ? { state: "PASS", detail: "Distribution authorization is recorded." }
    : packageState === "REVOKED"
      ? { state: "FAILED", detail: "Authorization revoked. New grants must stop." }
      : { state: "UNAVAILABLE", detail: "No distribution authorization is recorded." };

  return { INGEST: ingest, QC: qc, LEGAL: legal, RIGHTS: rights, PACKAGE: packaged, AUTHORIZED: authorized };
}
