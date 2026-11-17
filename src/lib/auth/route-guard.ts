import { redirect } from "@tanstack/react-router";
import { getBridgeSession } from "@/lib/bridge/session";

export type ProtectedBridgeSession = Awaited<ReturnType<typeof getBridgeSession>>;
export type AuthenticatedBridgeSession = ProtectedBridgeSession & {
  profile: NonNullable<ProtectedBridgeSession["profile"]>;
};

export type BridgeRouteAccess = "buyer" | "internal" | "super_admin" | "creator" | "studio" | "investor" | "workspace";

type SessionResult = ProtectedBridgeSession;

type GuardDependencies = {
  isBrowser: boolean;
  getSession: () => Promise<SessionResult>;
  goToLogin: () => never;
  goToOnboarding: () => never;
  goToWorkspace: () => never;
};

/**
 * Share route authorization behavior between route loaders and focused tests.
 * Server-function auth middleware still verifies every protected data request;
 * this guard is an early navigation gate, not a replacement security boundary.
 */
export async function resolveProtectedBridgeRoute(
  deps: GuardDependencies,
  access?: BridgeRouteAccess,
): Promise<AuthenticatedBridgeSession | undefined> {
  if (!deps.isBrowser) return undefined;

  let session: SessionResult;
  try {
    session = await deps.getSession();
  } catch {
    deps.goToLogin();
  }

  if (!session!.profile) deps.goToOnboarding();
  const profile = session!.profile!;

  const allowed =
    access === undefined || access === "workspace"
      ? access === "workspace"
        ? profile.emailVerified &&
          (profile.internalRole !== null || profile.accountType === "independent_creator" || profile.accountType === "studio")
        : true
      : access === "buyer"
        ? (!profile.internalRole && profile.accountType === "buyer") ||
          (profile.internalRole === "super_admin" && profile.emailVerified)
        : access === "internal"
          ? profile.internalRole !== null
          : access === "super_admin"
            ? profile.internalRole === "super_admin" && profile.emailVerified
            : !profile.internalRole &&
              profile.accountType === (access === "creator" ? "independent_creator" : access);

  if (!allowed) deps.goToWorkspace();
  if (!profile.emailVerified && access !== "buyer") deps.goToWorkspace();

  return session! as AuthenticatedBridgeSession;
}

const browserDependencies: GuardDependencies = {
  isBrowser: typeof window !== "undefined",
  getSession: () => getBridgeSession(),
  goToLogin: () => {
    throw redirect({ to: "/login", replace: true });
  },
  goToOnboarding: () => {
    throw redirect({ to: "/onboarding", replace: true });
  },
  goToWorkspace: () => {
    throw redirect({ to: "/workspace", replace: true });
  },
};

/** Route-level guard for the browser router. */
export function requireBridgeRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  return resolveProtectedBridgeRoute(browserDependencies);
}

export function requireBuyerRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  return resolveProtectedBridgeRoute(browserDependencies, "buyer");
}

export function requireInternalRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  return resolveProtectedBridgeRoute(browserDependencies, "internal");
}

export function requireSuperAdminRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  return resolveProtectedBridgeRoute(browserDependencies, "super_admin");
}

export function requireWorkspaceRoute(): Promise<AuthenticatedBridgeSession | undefined> {
  return resolveProtectedBridgeRoute(browserDependencies, "workspace");
}
