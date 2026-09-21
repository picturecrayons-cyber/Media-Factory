import { Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getBridgePublicStatus, getBridgeSession, type BridgeActor } from "@/lib/bridge/session";
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
  allow?: "creator" | "studio" | "buyer" | "internal" | "filmmaker";
}) {
  const { user, isPending } = useCurrentUserState();
  const sessionQ = useQuery({
    queryKey: ["bridge-session"],
    queryFn: () => getBridgeSession(),
    enabled: Boolean(user),
    retry: false,
  });
  const mailQ = useQuery({
    queryKey: ["bridge-public"],
    queryFn: () => getBridgePublicStatus(),
  });
  const mailReady = mailQ.data?.integrations.mail;

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
  if (allow === "filmmaker") {
    if (profile.internalRole || (profile.accountType !== "independent_creator" && profile.accountType !== "studio")) {
      return <Navigate to={sessionQ.data?.home ?? "/"} />;
    }
  } else if (allow && allow !== "internal" && (profile.internalRole || profile.accountType !== (
    allow === "creator" ? "independent_creator" : allow
  ))) {
    return <Navigate to={sessionQ.data?.home ?? "/"} />;
  }
  if (!profile.emailVerified) {
    return (
      <Frame>
        <h1 className="font-display text-2xl">Verify your email</h1>
        <p className="text-sm leading-relaxed text-muted">
          A verification mail is sent from abijithasokan@crayonspictures.com to {profile.email}.
          Bridge uses SMTP send only — not IMAP, not Gmail app setup.
        </p>
        {!mailReady ? (
          <p className="text-sm text-muted">
            Mail password is unset. Add SMTP_PASS on the Vercel Preview for this branch (Hostinger mailbox
            password). Do not paste it into chat or git.
          </p>
        ) : null}
        <Button
          type="button"
          disabled={!mailReady}
          onClick={() => {
            void requestEmailVerification()
              .then(() => toast("Verification mail sent"))
              .catch((err) =>
                toast(err instanceof Error ? err.message : "Mail send failed"),
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