import { redirect } from "@tanstack/react-router";
import { getBridgeSession, type BridgeActor } from "@/lib/bridge/session";

export type ProtectedBridgeSession = Awaited<ReturnType<typeof getBridgeSession>>;

async function getProtectedSession(): Promise<ProtectedBridgeSession> {
  try {
    return await getBridgeSession();
  } catch {
    throw redirect({ to: "/login", replace: true });
  }
}

export async function requireBridgeRoute(): Promise<ProtectedBridgeSession> {
  const session = await getProtectedSession();

  if (!session.profile) {
    throw redirect({ to: "/onboarding", replace: true });
  }

  return session;
}

export async function requireBuyerRoute(): Promise<ProtectedBridgeSession> {
  const session = await requireBridgeRoute();
  const actor = session.profile as BridgeActor;

  if (actor.internalRole || actor.accountType !== "buyer") {
    throw redirect({ to: (session.home || "/workspace") as any, replace: true });
  }

  return session;
}

export async function requireInternalRoute(): Promise<ProtectedBridgeSession> {
  const session = await requireBridgeRoute();
  const actor = session.profile as BridgeActor;

  if (!actor.internalRole) {
    throw redirect({ to: (session.home || "/workspace") as any, replace: true });
  }

  return session;
}
