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


export function resolvePostLoginDestination(input: {
  next: string | null;
  sessionHome: string | null | undefined;
}): string {
  const next = input.next;
  const safeNext = Boolean(
    next && next.startsWith("/") && !next.startsWith("//") && !next.includes("://"),
  );
  if (safeNext) return next!;
  return input.sessionHome || "/onboarding";
}
