export const STUDIO_SCHEDULE_EVENT_TYPES = [
  "PRE_PRODUCTION",
  "SHOOT_DAY",
  "WRAP",
  "DIT_HANDOFF",
  "POST_PRODUCTION",
  "DELIVERY",
  "OTHER",
] as const;

export const STUDIO_SCHEDULE_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type StudioScheduleEventType = (typeof STUDIO_SCHEDULE_EVENT_TYPES)[number];
export type StudioScheduleStatus = (typeof STUDIO_SCHEDULE_STATUSES)[number];

export function canManageStudioSchedule(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "producer";
}

export function isValidStudioScheduleWindow(startsAt: string, endsAt: string): boolean {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export function canTransitionStudioScheduleStatus(
  current: StudioScheduleStatus,
  next: StudioScheduleStatus,
): boolean {
  if (current === "SCHEDULED") return next === "IN_PROGRESS" || next === "CANCELLED";
  if (current === "IN_PROGRESS") return next === "COMPLETED" || next === "CANCELLED";
  return false;
}
