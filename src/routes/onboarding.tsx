import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completeOnboarding } from "@/lib/bridge/profiles";
import { getBridgeSession } from "@/lib/bridge/session";
import { retryWorkspaceSession } from "@/lib/auth/workspace-session-retry";
import { supabase } from "@/lib/supabase";
import { ACCOUNT_TYPES } from "@/lib/bridge/types";
import { publicOnboardingError } from "@/lib/bridge/onboarding-errors";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const SESSION_TIMEOUT_MS = 12_000;

async function getBridgeSessionWithTimeout() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getBridgeSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Session check timed out. Please retry.")), SESSION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function goHome(home: string | null | undefined, navigate: ReturnType<typeof useNavigate>) {
  const dest = home || "/dashboard";
  void navigate({ to: dest as any, replace: true });
}

function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: getBridgeSessionWithTimeout,
    enabled: !isPending && Boolean(user),
    retry: 1,
    retryDelay: 500,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitInFlight = useRef(false);
  const [retrying, setRetrying] = useState(false);

  const home = sessionQ.data?.profile ? sessionQ.data.home : null;
  useEffect(() => {
    if (home) goHome(home, navigate);
  }, [home, navigate]);

  if (isPending || (user && sessionQ.isPending) || home) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <p className="text-sm text-muted">{home ? "Opening workspace…" : "Loading session…"}</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;

  if (sessionQ.isError) {
    async function retrySession() {
      if (retrying) return;
      setRetrying(true);
      setError(null);
      try {
        const outcome = await retryWorkspaceSession({
          checkUser: () => supabase.auth.getUser(),
          refetch: async () => {
            const result = await sessionQ.refetch();
            if (result.error) throw result.error;
          },
          signIn: async () => {
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
            void navigate({ to: "/login", replace: true });
          },
        });
        if (outcome === "unavailable") {
          setError("The authentication service is unavailable. Please try again shortly.");
        }
      } catch {
        setError("Bridge could not load onboarding. Please try again shortly.");
      } finally {
        setRetrying(false);
      }
    }

    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-sm space-y-4 rounded-md border border-line bg-surface p-6">
          <BrandMark />
          <h1 className="font-display text-2xl">Could not load onboarding</h1>
          <p className="text-sm leading-relaxed text-muted">
            Bridge could not load your account. Retry to check the service without clearing your session.
          </p>
          {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
          <Button type="button" disabled={retrying} className="w-full" onClick={() => void retrySession()}>
            {retrying ? "Checking…" : "Retry onboarding"}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => void navigate({ to: "/login" })}>
            Sign in again
          </Button>
        </div>
      </main>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setBusy(true);
    setError(null);

    let inviteToken: string | undefined;
    try {
      inviteToken = sessionStorage.getItem("bridge-invite") ?? undefined;
    } catch {
      inviteToken = undefined;
    }

    const authUser = (await supabase.auth.getUser()).data.user;
    const metadata = authUser?.user_metadata ?? {};
    const displayName = String(metadata.full_name || metadata.name || user?.displayName || user?.primaryEmail?.split("@")[0] || "").trim();
    const savedAccountType = String(metadata.account_type || "independent_creator");
    const accountType = ACCOUNT_TYPES.includes(savedAccountType as (typeof ACCOUNT_TYPES)[number])
      ? (savedAccountType as (typeof ACCOUNT_TYPES)[number])
      : "independent_creator";
    const organizationName = String(metadata.organization_name || "").trim() || undefined;

    try {
      const res = await completeOnboarding({
        data: {
          displayName,
          accountType,
          organizationName,
          inviteToken,
        },
      });
      try {
        sessionStorage.removeItem("bridge-invite");
      } catch {
        /* ignore */
      }
      goHome(res.home, navigate);
    } catch (err) {
      setError(publicOnboardingError(err));
    } finally {
      submitInFlight.current = false;
      setBusy(false);
    }
  }

  const metadata = {} as Record<string, unknown>;
  const savedAccountType = String(metadata.account_type || "independent_creator");
  const accountType = ACCOUNT_TYPES.includes(savedAccountType as (typeof ACCOUNT_TYPES)[number])
    ? savedAccountType
    : "independent_creator";
  const accountLabel =
    accountType === "studio" ? "Studio / Production" :
    accountType === "buyer" ? "Buyer / Platform" :
    "Creator / Filmmaker";

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface p-7 text-center shadow-sm"
      >
        <BrandMark />
        <div>
          <h1 className="font-display text-2xl font-semibold">You’re ready</h1>
          <p className="mt-2 text-sm text-muted">{accountLabel}</p>
        </div>
        {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
        <Button type="submit" disabled={busy} className="h-11 w-full rounded-full font-semibold">
          {busy ? "Opening Bridge…" : "Enter Bridge"}
        </Button>
      </form>
    </main>
  );
}
