import { redirect } from "@tanstack/react-router";
import { getBridgeSession } from "@/lib/bridge/session";

export type ProtectedBridgeSession = Awaited<ReturnType<typeof getBridgeSession>>;
export type AuthenticatedBridgeSession = ProtectedBridgeSession & {
  profile: NonNullable<ProtectedBridgeSession["profile"]>;
};

/**
 * Route-level guard for the browser router.
 *
 * Supabase Bridge sessions are persisted in browser storage, while the actual
 * security boundary remains the authenticated server-function middleware.
 * During SSR there is no browser token to forward, so the existing component
 * gate and protected server functions remain authoritative until hydration.
 */
async function getProtectedSession(): Promise<ProtectedBridgeSession | null> {
  if (typeof window === "undefined") return null;

  try {
    return await getBridgeSession();
  } catch {
    throw redirect({ to: "/login", replace: true });
  }
}

export async function requireBridgeRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  const session = await getProtectedSession();

  if (!session) return undefined;

  if (!session.profile) {
    throw redirect({ to: "/onboarding", replace: true });
  }

  return session as AuthenticatedBridgeSession;
}

export async function requireBuyerRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  const session = await requireBridgeRoute();
  if (!session) return undefined;

  if (session.profile.internalRole || session.profile.accountType !== "buyer") {
    throw redirect({ to: "/workspace", replace: true });
  }

  return session;
}

export async function requireInternalRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  const session = await requireBridgeRoute();
  if (!session) return undefined;

  if (!session.profile.internalRole) {
    throw redirect({ to: "/workspace", replace: true });
  }

  return session;
}
