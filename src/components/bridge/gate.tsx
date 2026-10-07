import { Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { retryWorkspaceSession } from "@/lib/auth/workspace-session-retry";
import { supabase } from "@/lib/supabase";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getBridgeSession, type BridgeActor } from "@/lib/bridge/session";
import { requestEmailVerification } from "@/lib/bridge/profiles";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./shell";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md space-y-4 rounded-md border border-line bg-surface p-6">
        <BrandMark />
        {children}
      </div>
    </div>
  );
}

export function RequireBridge({
  children,
  allow,
}: {
  children: (actor: BridgeActor) => ReactNode;
  allow?: "creator" | "studio" | "buyer" | "investor" | "internal" | "super_admin";
}) {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const { user, isPending } = useCurrentUserState();
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: () => getBridgeSession(),
    enabled: !isPending && Boolean(user),
    retry: false,
  });
  const verifyMail = useMutation({
    mutationFn: () => requestEmailVerification(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bridge-session"] });
    },
  });

  if (isPending || (user && sessionQ.isPending)) {
    return (
      <Frame>
        <p className="text-sm text-muted">Opening your desk…</p>
      </Frame>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (sessionQ.error) {
    async function retrySession() {
      if (retrying) return;
      setRetrying(true);
      setRetryError(null);
      try {
        const outcome = await retryWorkspaceSession({
          checkUser: () => supabase.auth.getUser(),
          refetch: () => sessionQ.refetch(),
          signIn: async () => {
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
            window.location.assign("/login");
          },
        });
        if (outcome === "unavailable") {
          setRetryError("The authentication service is unavailable. Please try again shortly.");
        }
      } catch {
        setRetryError("The workspace service is unavailable. Please try again shortly.");
      } finally {
        setRetrying(false);
      }
    }

    return (
      <Frame>
        <h1 className="font-display text-2xl">Could not open workspace</h1>
        <p role="alert" className="text-sm text-muted">
          Bridge could not load your workspace. Retry to check the service without clearing your session.
        </p>
        {retryError ? <p role="alert" className="text-sm text-accent">{retryError}</p> : null}
        <Button type="button" disabled={retrying} onClick={() => void retrySession()}>{retrying ? "Checking…" : "Retry workspace"}</Button>
        <Link to="/login" className="block text-sm text-accent underline-offset-4 hover:underline">Sign in</Link>
      </Frame>
    );
  }

  const profile = sessionQ.data?.profile ?? null;
  if (!profile) return <Navigate to="/onboarding" />;

  // Role gates are authoritative for role-specific workspaces:
  // creator/studio/buyer/investor accounts are valid Bridge users and must not be
  // blocked by the internal-operator gate. Internal surfaces remain protected
  // by the explicit "internal"/"super_admin" allow checks above.
  if (allow === "super_admin" && profile.internalRole !== "super_admin") return <Navigate to={sessionQ.data?.home ?? "/"} />;
  if (allow === "internal" && !profile.internalRole) return <Navigate to={sessionQ.data?.home ?? "/"} />;
  if (allow && allow !== "internal" && allow !== "super_admin" && (profile.internalRole || profile.accountType !== (
    allow === "creator" ? "independent_creator" : allow
  ))) {
    return <Navigate to={sessionQ.data?.home ?? "/"} />;
  }

  if (!profile.emailVerified) {
    return (
      <Frame>
        <h1 className="font-display text-2xl">Verify your email</h1>
        <p className="text-sm leading-relaxed text-muted">
          Bridge operations require a verified mailbox. We will send the verification link to {profile.email}.
        </p>
        <Button
          type="button"
          disabled={verifyMail.isPending}
          onClick={() => verifyMail.mutate()}
        >
          {verifyMail.isPending ? "Sending…" : "Send verification"}
        </Button>
        {verifyMail.isSuccess ? (
          <p className="text-sm text-muted">Verification email sent. Open the newest Crayons Bridge message and use the link within 24 hours.</p>
        ) : null}
        {verifyMail.isError ? (
          <p className="text-sm text-accent">
            {verifyMail.error instanceof Error ? verifyMail.error.message : "Could not send verification email."}
          </p>
        ) : null}
        <Link to="/account" className="block text-sm text-accent underline-offset-4 hover:underline">
          Account
        </Link>
      </Frame>
    );
  }

  return <>{children(profile)}</>;
}
