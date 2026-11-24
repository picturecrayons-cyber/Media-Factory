import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completeOnboarding, getDistributionMandateStatus } from "@/lib/bridge/profiles";
import { getBridgeSession } from "@/lib/bridge/session";
import { publicAccountTypeFrom } from "@/lib/auth/public-account-type";
import { publicOnboardingError } from "@/lib/bridge/onboarding-errors";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Onboarding,
});

type PublicAccountType = "independent_creator" | "studio" | "buyer";

function goHome(home: string | null | undefined, navigate: ReturnType<typeof useNavigate>) {
  if (home) void navigate({ to: home as any, replace: true });
}

const ROLE_LABELS: Record<PublicAccountType, string> = {
  independent_creator: "Creator",
  studio: "Studio",
  buyer: "Buyer",
};

function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: () => getBridgeSession(),
    enabled: !isPending && Boolean(user),
    retry: 1,
  });
  const profile = sessionQ.data?.profile ?? null;
  const mandateQ = useQuery({ queryKey: ["bridge-distribution-mandate", user?.id], queryFn: () => getDistributionMandateStatus(), enabled: !isPending && Boolean(user) && Boolean(profile), retry: false });
  const existingRightsHolder = Boolean(profile && !profile.internalRole && (profile.accountType === "independent_creator" || profile.accountType === "studio"));
  const existingNeedsMandate = Boolean(existingRightsHolder && mandateQ.data?.required && !mandateQ.data.accepted);
  const mandateSchemaBlocked = Boolean(existingRightsHolder && mandateQ.data?.required && !mandateQ.data.schemaReady);
  const mandateStatusBlocked = Boolean(existingRightsHolder && mandateQ.data?.required && mandateQ.data.schemaReady && mandateQ.data.status && !mandateQ.data.accepted);
  const signupAccountTypeHint = user?.signupAccountTypeHint;
  const roleFromSignup = publicAccountTypeFrom(signupAccountTypeHint);
  const unsupportedSignupRole = Boolean(signupAccountTypeHint && !roleFromSignup);
  const [accountType, setAccountType] = useState<PublicAccountType>(roleFromSignup ?? "independent_creator");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [organizationName, setOrganizationName] = useState("");
  const [mandateAccepted, setMandateAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingRightsHolder && profile) {
      setAccountType(profile.accountType as PublicAccountType);
      setDisplayName(profile.displayName);
      setOrganizationName(profile.organizationName ?? "");
    } else if (roleFromSignup) setAccountType(roleFromSignup);
  }, [existingRightsHolder, profile, roleFromSignup]);

  useEffect(() => {
    if (!displayName && user?.displayName) setDisplayName(user.displayName);
  }, [displayName, user?.displayName]);

  const mandateResolved = !existingRightsHolder || Boolean(mandateQ.data) || mandateQ.isError;
  const home = profile && mandateResolved && !existingNeedsMandate && !mandateSchemaBlocked && !mandateStatusBlocked && !mandateQ.isError ? sessionQ.data?.home : null;
  useEffect(() => {
    if (home) goHome(home, navigate);
  }, [home, navigate]);

  if (isPending || (user && sessionQ.isPending) || (existingRightsHolder && mandateQ.isPending) || home) {
    return <main className="grid min-h-screen place-items-center bg-bg p-6"><p className="text-sm text-muted">Opening Bridge…</p></main>;
  }
  if (!user) return <RedirectToSignIn />;

  if (profile && (mandateQ.isError || mandateSchemaBlocked || mandateStatusBlocked)) {
    const message = mandateSchemaBlocked
      ? "The Distribution Mandate schema is not installed in this Preview database. Acceptance is blocked until a separately approved Testing migration is applied."
      : mandateStatusBlocked
        ? "This account-level mandate is suspended or revoked. A Super Admin review is required; it cannot be re-accepted here."
        : "Bridge could not verify the Distribution Mandate status. Access remains fail-closed; retry the status check.";
    return <main className="grid min-h-screen place-items-center bg-bg p-5"><section className="w-full max-w-lg space-y-4 rounded-xl border border-line bg-surface p-6"><BrandMark /><h1 className="font-display text-2xl font-semibold">Distribution Mandate verification</h1><p role="alert" className="text-sm text-muted">{message}</p><Button type="button" variant="outline" onClick={() => void mandateQ.refetch()} className="w-full">Retry verification</Button><Link to="/contact" className="text-sm text-accent underline">Contact Bridge</Link></section></main>;
  }

  if (unsupportedSignupRole) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-5">
        <section className="w-full max-w-md space-y-4 rounded-xl border border-line bg-surface p-6">
          <BrandMark />
          <h1 className="font-display text-2xl font-semibold">Access request</h1>
          <p className="text-sm text-muted">This workspace requires a separate review or invitation. No elevated role has been granted.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/contact" className="text-sm font-semibold text-accent underline">Request access</Link>
            <Link to="/login" className="text-sm text-muted underline">Sign in</Link>
          </div>
        </section>
      </main>
    );
  }

  async function createWorkspace() {
    if (submitInFlight.current) return;
    setError(null);
    if (!displayName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (accountType === "studio" && !organizationName.trim()) {
      setError("Enter your studio or company name.");
      return;
    }
    if ((accountType === "independent_creator" || accountType === "studio") && !mandateAccepted) {
      setError("Accept the Creator Distribution Mandate to continue.");
      return;
    }
    submitInFlight.current = true;
    setBusy(true);
    try {
      let inviteToken: string | undefined;
      try { inviteToken = sessionStorage.getItem("bridge-invite") ?? undefined; } catch { /* session storage may be unavailable */ }
      const result = await completeOnboarding({
        data: {
          displayName: displayName.trim(),
          accountType,
          organizationName: accountType === "studio" ? organizationName.trim() : undefined,
          inviteToken,
          creatorMandateAccepted: accountType === "independent_creator" || accountType === "studio" ? mandateAccepted : undefined,
        },
      });
      try { sessionStorage.removeItem("bridge-invite"); } catch { /* ignore */ }
      const destination = result.home || (accountType === "buyer" ? "/buyer" : accountType === "studio" ? "/studio" : "/creator");
      void navigate({ to: destination as any, replace: true });
    } catch (err) {
      setError(publicOnboardingError(err));
    } finally {
      submitInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-5">
      <section className="w-full max-w-lg space-y-5 rounded-xl border border-line bg-surface p-6 sm:p-7">
        <BrandMark />
        <div>
          <h1 className="mt-4 font-display text-2xl font-semibold">Create your Bridge workspace</h1>
          <p className="mt-1 text-sm text-muted">Choose your account role. Access remains subject to Bridge verification and approval.</p>
        </div>

        <label className="block text-sm font-medium">
          Your name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="mt-1.5 h-11 w-full rounded-md border border-line-strong bg-elevated px-3" />
        </label>

        {profile ? <div className="rounded-md border border-line bg-elevated px-3 py-3 text-sm"><span className="font-medium">Workspace</span><p className="mt-1 text-muted">{ROLE_LABELS[accountType]}{accountType === "studio" && organizationName ? ` · ${organizationName}` : ""}</p></div> : (
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-2 text-sm font-medium">Workspace</legend>
            {(Object.keys(ROLE_LABELS) as PublicAccountType[]).map((role) => (
              <label key={role} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-semibold ${accountType === role ? "border-accent bg-accent-soft text-accent" : "border-line bg-elevated"}`}>
                <input className="sr-only" type="radio" name="accountType" checked={accountType === role} onChange={() => setAccountType(role)} />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </fieldset>
        )}

        {accountType === "studio" && !profile ? (
          <label className="block text-sm font-medium">
            Studio / company name
            <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} autoComplete="organization" className="mt-1.5 h-11 w-full rounded-md border border-line-strong bg-elevated px-3" />
          </label>
        ) : null}

        {accountType === "independent_creator" || accountType === "studio" ? (
          <section className="space-y-3 rounded-xl border border-line p-4">
            <h2 className="font-display text-lg font-semibold">Multiplatform Distribution Mandate</h2>
            <p className="text-sm leading-relaxed text-muted">You authorize Bridge to administer distribution requests for Crayons Loop, external OTT, broadcast/TV, TVOD/EST, FAST, festival/educational and buyer delivery within the recorded scope. Each title still requires its own rights evidence, territory, language, media, time window and independent Legal approval. This mandate does not transfer ownership or automatically approve a title.</p>
            <p className="text-sm text-muted">Sublicensing is OFF by default and requires both this mandate and the individual title's approved rights grant.</p>
            <label className="flex items-start gap-3 rounded-lg border border-line bg-elevated p-3 text-sm"><input required type="checkbox" checked={mandateAccepted} onChange={(event) => setMandateAccepted(event.target.checked)} className="mt-0.5 accent-current" /><span>I have read and accept the Creator Distribution Mandate (version 1). Title-level approvals remain separate; this does not grant rights I do not own.</span></label>
          </section>
        ) : null}
        {accountType === "buyer" ? (
          <p className="rounded-md border border-line px-3 py-2 text-xs text-muted">Buyer workspace access and title visibility are controlled by Bridge approval and title-level permissions.</p>
        ) : null}
        {accountType === "independent_creator" || accountType === "studio" ? (
          <p className="rounded-md border border-line px-3 py-2 text-xs text-muted">Creating an account does not approve a title, verify rights, or grant licensing or publication authority.</p>
        ) : null}

        {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
        <Button type="button" disabled={busy} onClick={() => void createWorkspace()} className="w-full">{busy ? "Saving…" : profile ? "Accept mandate and continue" : "Create workspace"}</Button>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <Link to="/submit-film" className="text-accent underline">Submit a title later</Link>
          <Link to="/login" className="text-muted underline">Sign out / sign in</Link>
        </div>
      </section>
    </main>
  );
}
