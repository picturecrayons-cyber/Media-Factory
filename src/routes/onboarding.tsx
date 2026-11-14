import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completeOnboarding } from "@/lib/bridge/profiles";
import { createTitle } from "@/lib/bridge/titles";
import { getBridgeSession } from "@/lib/bridge/session";
import { retryWorkspaceSession } from "@/lib/auth/workspace-session-retry";
import { supabase } from "@/lib/supabase";
import { ACCOUNT_TYPES } from "@/lib/bridge/types";
import { publicAccountTypeFrom } from "@/lib/auth/public-account-type";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";
import { publicOnboardingError } from "@/lib/bridge/onboarding-errors";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Onboarding,
});

type PublicAccountType = "independent_creator" | "studio" | "buyer";

const ACCOUNT_LABELS: Record<PublicAccountType, string> = {
  independent_creator: "Independent Creator",
  studio: "Studio / Company",
  buyer: "Buyer / Acquisitions",
};

const LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English", "Bengali", "Marathi", "Other"];
const TERRITORIES = ["India", "Worldwide", "South Asia", "GCC", "North America", "United Kingdom", "Europe", "Australia / New Zealand", "Other"];
const MEDIA = ["SVOD", "TVOD", "AVOD", "FAST", "Broadcast", "Theatrical", "Airline", "Educational", "Festival", "Crayons Loop"];
const DESTINATIONS = ["Crayons Loop", "External OTT", "Broadcast / TV", "TVOD / EST", "FAST", "Festival / Educational", "Buyer delivery"];

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
  void navigate({ to: (home || "/dashboard") as any, replace: true });
}

function CheckGroup({
  label,
  values,
  selected,
  onChange,
  required = false,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (value: string, checked: boolean) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-fg">
        {label}{required ? " *" : ""}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {values.map((value) => (
          <label key={value} className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-elevated px-3 text-xs text-fg">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(e) => onChange(value, e.target.checked)}
              className="accent-current"
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
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

  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<PublicAccountType>("independent_creator");
  const [organizationName, setOrganizationName] = useState("");


  if (sessionQ.isError) {
    async function retrySession() {
      if (retrying) return;
      setRetrying(true);
      setError(null);
      try {
        await retryWorkspaceSession({
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
      } catch {
        setError("Bridge could not load onboarding. Please try again shortly.");
      } finally {
        setRetrying(false);
      }
    }
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
          <BrandMark />
          <h1 className="font-display text-2xl">Could not load Bridge</h1>
          <p className="text-sm leading-relaxed text-muted">Retry without clearing your session.</p>
          {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
          <Button type="button" disabled={retrying} className="w-full" onClick={() => void retrySession()}>
            {retrying ? "Checking…" : "Retry"}
          </Button>
        </div>
      </main>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (unsupportedSignupRole) {
      setError("This account type needs an invitation or support review. Please contact Crayons Bridge before continuing.");
      return;
    }
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setBusy(true);
    setError(null);

    try {
      let inviteToken: string | undefined;
      try {
        inviteToken = sessionStorage.getItem("bridge-invite") ?? undefined;
      } catch {
        // Ignore unavailable browser storage.
      }

      const result = await completeOnboarding({
        data: {
          displayName: displayName.trim(),
          accountType,
          organizationName: accountType === "studio" ? organizationName.trim() : undefined,
          inviteToken,
        },
      });

      try {
        sessionStorage.removeItem("bridge-invite");
      } catch {
        // Ignore unavailable browser storage.
      }

      const destination = result.home || (
        accountType === "buyer" ? "/buyer" :
        accountType === "studio" ? "/studio" : "/creator"
      );
      void navigate({ to: destination as any, replace: true });
    } catch (err) {
      setError(publicOnboardingError(err));
    } finally {
      submitInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-5 sm:p-8">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-xl space-y-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="text-center">
          <BrandMark />
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">Complete your Bridge account</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Set up your workspace first. You can submit films, concepts, rights documents and assets after entering your dashboard.
          </p>
        </div>

        <section className="space-y-4 rounded-2xl border border-line p-5">
          <div>
            <h2 className="font-display text-lg font-semibold">Account details</h2>
            <p className="mt-1 text-xs text-muted">Your verified sign-in determines your identity. Your selected account type determines the public workspace requested during onboarding.</p>
          </div>

          {unsupportedSignupRole ? (
            <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-fg">
              This signup link contains a role that is not available through public onboarding. No role has been granted.{" "}
              <Link to="/contact" className="font-semibold underline">Contact Bridge</Link> to request the correct workspace.
            </div>
          ) : null}

          <label className="block text-sm font-medium">
            Your name *
            <input
              required
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5"
            />
          </label>

          <label className="block text-sm font-medium">
            Account type *
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as PublicAccountType)}
              disabled={Boolean(signupAccountType)}
              className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5"
            >
              {(Object.keys(ACCOUNT_LABELS) as PublicAccountType[]).map((type) => (
                <option key={type} value={type}>{ACCOUNT_LABELS[type]}</option>
              ))}
            </select>
            {signupAccountType ? (
              <span className="mt-1 block text-xs text-muted">Using the account type selected during signup.</span>
            ) : null}
          </label>

          {accountType === "studio" ? (
            <label className="block text-sm font-medium">
              Studio / company name *
              <input
                required
                maxLength={120}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5"
              />
            </label>
          ) : null}
        </section>

        {accountType === "independent_creator" ? (
          <div className="rounded-xl border border-line bg-elevated p-4 text-sm text-muted">
            Your Creator dashboard opens after account setup. Finished Film submissions and Story / Concept proposals are separate workflows inside the dashboard.
          </div>
        ) : null}
        {accountType === "studio" ? (
          <div className="rounded-xl border border-line bg-elevated p-4 text-sm text-muted">
            Your Studio dashboard opens after account setup. Production setup and title submissions can be completed from the Studio workspace.
          </div>
        ) : null}
        {accountType === "buyer" ? (
          <div className="rounded-xl border border-line bg-elevated p-4 text-sm text-muted">
            Your Buyer dashboard opens after account setup. Only approved, buyer-visible titles and explicitly granted licenses will be available.
          </div>
        ) : null}

        {error ? <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted">© 2026 StreamVista OPC Pvt Ltd. Crayons Bridge.</p>
          <Button type="submit" disabled={busy || unsupportedSignupRole} className="h-11 rounded-full px-6 font-semibold">
            {busy ? "Creating workspace…" : "Continue to dashboard"}
          </Button>
        </div>
      </form>
    </main>
  );

}
