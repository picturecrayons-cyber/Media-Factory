export type SignInGateState = "pending" | "signed_in" | "signed_out";

export type SignInGateInput = {
  isPending: boolean;
  hasUser: boolean;
};

export function resolveSignInGateState(
  input: SignInGateInput,
): SignInGateState {
  if (input.isPending) return "pending";
  return input.hasUser ? "signed_in" : "signed_out";
}

/**
 * A user workspace is determined by the verified server-side Bridge profile.
 * Query-string navigation intent must never override Creator, Studio, Buyer,
 * Investor, or Super Admin RBAC routing.
 */
export function resolvePostLoginDestination(input: {
  sessionHome: string | null | undefined;
}): string {
  return input.sessionHome || "/onboarding";
}
