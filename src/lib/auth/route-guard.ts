import { redirect } from "@tanstack/react-router";
import { getBridgeSession } from "@/lib/bridge/session";

export type ProtectedBridgeSession = Awaited<ReturnType<typeof getBridgeSession>>;
export type AuthenticatedBridgeSession = ProtectedBridgeSession & {
  profile: NonNullable<ProtectedBridgeSession["profile"]>;
};

async function getProtectedSession(): Promise<ProtectedBridgeSession> {
  try {
    return await getBridgeSession();
  } catch {
    throw redirect({ to: "/login", replace: true });
  }
}

export async function requireBridgeRoute(): Promise<AuthenticatedBridgeSession> {
  const session = await getProtectedSession();

  if (!session.profile) {
    throw redirect({ to: "/onboarding", replace: true });
  }

  return session;
}

export async function requireBuyerRoute(): Promise<AuthenticatedBridgeSession> {
  const session = await requireBridgeRoute();

  if (session.profile.internalRole || session.profile.accountType !== "buyer") {
    throw redirect({ to: "/workspace", replace: true });
  }

  return session;
}

export async function requireInternalRoute(): Promise<AuthenticatedBridgeSession> {
  const session = await requireBridgeRoute();

  if (!session.profile.internalRole) {
    throw redirect({ to: "/workspace", replace: true });
  }

  return session;
}
