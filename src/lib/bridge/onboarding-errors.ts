export const ONBOARDING_EMAIL_CONFLICT_MESSAGE =
  "This email is already associated with an existing Bridge profile. Sign in with the original account or contact support.";

export const ONBOARDING_GENERIC_ERROR_MESSAGE =
  "Could not complete onboarding. Please try again or contact support.";

const SAFE_ONBOARDING_MESSAGES = new Set([
  ONBOARDING_EMAIL_CONFLICT_MESSAGE,
  "Confirm your email before entering Bridge.",
  "Invite is invalid or expired",
  "Invite email does not match this account",
  "Organization name is required",
]);

export function isBridgeProfileEmailConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (candidate.code !== "23505") return false;
  const constraint = typeof candidate.constraint === "string" ? candidate.constraint : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return constraint === "bridge_profiles_email_idx" || message.includes("bridge_profiles_email_idx");
}

export function publicOnboardingError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return SAFE_ONBOARDING_MESSAGES.has(message) ? message : ONBOARDING_GENERIC_ERROR_MESSAGE;
}
