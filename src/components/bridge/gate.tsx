import { Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { RedirectToSignIn } from "@/lib/auth/gates";
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
  allow?: "creator" | "studio" | "buyer" | "internal";
}) {
  const { user, isPending } = useCurrentUserState();
  const sessionQ = useQuery({
    queryKey: ["bridge-session"],
    queryFn: () => getBridgeSession(),
    enabled: Boolean(user),
    retry: false,
  });

  if (isPending || (user && sessionQ.isPending)) {
    return (
      <Frame>
        <p className="text-sm text-muted">Opening your desk…</p>
      </Frame>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (sessionQ.error) return <RedirectToSignIn />;
  const profile = sessionQ.data?.profile ?? null;
  if (!profile) return <Navigate to="/onboarding" />;
  if (allow === "internal" && !profile.internalRole) return <Navigate to={sessionQ.data?.home ?? "/"} />;
  if (allow && allow !== "internal" && (profile.internalRole || profile.accountType !== (
    allow === "creator" ? "independent_creator" : allow
  ))) {
    return <Navigate to={sessionQ.data?.home ?? "/"} />;
  }
  if (!profile.emailVerified) {
    return (
      <Frame>
        <h1 className="font-display text-2xl">Verify your email</h1>
        <p className="text-sm leading-relaxed text-muted">
          Bridge operations require a verified mailbox. A Hostinger message is sent to {profile.email}.
        </p>
        <Button
          type="button"
          onClick={() => {
            void requestEmailVerification()
              .then(() => toast("Verification mail sent"))
              .catch((err) =>
                toast(err instanceof Error ? err.message : "Transactional email is not configured"),
              );
          }}
        >
          Send verification
        </Button>
        <Link to="/account" className="block text-sm text-accent underline-offset-4 hover:underline">
          Account
        </Link>
      </Frame>
    );
  }
  return <>{children(profile)}</>;
}