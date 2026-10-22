import { z } from "zod";

export const loopAnalyticsEventInput = z.object({
  eventId: z.string().uuid(),
  loopTitleId: z.string().min(1).max(160),
  sessionId: z.string().uuid(),
  eventType: z.enum(["TITLE_VIEW", "PLAYBACK_START", "PLAYBACK_PROGRESS", "PLAYBACK_COMPLETE"]),
  watchedSeconds: z.number().int().min(0).max(30).default(0),
});

export type LoopAnalyticsEventInput = z.infer<typeof loopAnalyticsEventInput>;
