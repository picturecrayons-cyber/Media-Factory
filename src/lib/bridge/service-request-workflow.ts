export const SERVICE_REQUEST_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "QUOTE_READY",
  "AWAITING_PAYMENT",
  "PAID",
  "ASSIGNED",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

const TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["CANCELLED"],
  QUOTE_READY: ["CANCELLED"],
  AWAITING_PAYMENT: ["CANCELLED"],
  PAID: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["REVIEW"],
  REVIEW: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionServiceRequest(
  from: ServiceRequestStatus,
  to: ServiceRequestStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertServiceRequestTransition(
  from: ServiceRequestStatus,
  to: ServiceRequestStatus,
): void {
  if (!canTransitionServiceRequest(from, to)) {
    throw new Error(`Invalid service request transition: \${from} -> \${to}`);
  }
}
