export type GateStatus = "VERIFIED" | "BLOCKED" | "UNVERIFIED";

export type PublishingGatewayGate = {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
};

export function publishingGatewayIsReady(gates: readonly PublishingGatewayGate[]): boolean {
  return gates.length > 0 && gates.every((gate) => gate.status === "VERIFIED");
}

export function canRequestPublishingGatewayRelease(input: {
  role: string | null | undefined;
  explicitApproval: boolean;
  gates: readonly PublishingGatewayGate[];
}): boolean {
  return input.role === "super_admin" && input.explicitApproval && publishingGatewayIsReady(input.gates);
}

export function initialPublishingGatewayState() {
  return {
    releaseStatus: "HOLD" as const,
    ready: false,
    note: "Production release remains on HOLD until every required check is verified.",
  };
}
