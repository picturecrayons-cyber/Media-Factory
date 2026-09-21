import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completeOnboarding } from "@/lib/bridge/profiles";
import { getBridgeSession } from "@/lib/bridge/session";
import { ACCOUNT_TYPES } from "@/lib/bridge/types";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  independent_creator: "Independent creator",
  studio: "Studio",
  buyer: "Buyer",
};

function goHome(home: string, navigate: ReturnType<typeof useNavigate>) {
  if (home === "/creator" || home === "/studio" || home === "/buyer" || home === "/internal") {
    void navigate({ to: home });
  } else {
    void navigate({ to: "/onboarding" });
  }
}

function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const sessionQ = useQuery({
    queryKey: ["bridge-session"],
    queryFn: () => getBridgeSession(),
    enabled: Boolean(user),
    retry: false,
  });
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<(typeof ACCOUNT_TYPES)[number]>("independent_creator");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isPending || (user && sessionQ.isPending)) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <p className="text-sm text-muted">Loading session…</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (sessionQ.data?.profile) {
    goHome(sessionQ.data.home, navigate);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let inviteToken: string | undefined;
    try {
      inviteToken = sessionStorage.getItem("bridge-invite") ?? undefined;
    } catch {
      inviteToken = undefined;
    }
    try {
      const res = await completeOnboarding({
        data: {
          displayName,
          accountType,
          organizationName: organizationName || undefined,
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
      setError(err instanceof Error ? err.message : "Could not complete onboarding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md space-y-5 rounded-md border border-line bg-surface p-6"
      >
        <BrandMark />
        <h1 className="font-display text-2xl">Choose your desk</h1>
        <p className="text-sm leading-relaxed text-muted">
          This becomes your account type. Internal roles only attach when the invite mailbox matches.
        </p>
        <label className="block text-sm">
          Display name
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm">Account type</legend>
          {ACCOUNT_TYPES.map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-3 rounded-sm border border-line px-3">
              <input
                type="radio"
                name="accountType"
                checked={accountType === t}
                onChange={() => setAccountType(t)}
              />
              <span>{LABELS[t]}</span>
            </label>
          ))}
        </fieldset>
        {accountType !== "independent_creator" ? (
          <label className="block text-sm">
            Organization
            <input
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
            />
          </label>
        ) : null}
        {error ? <p className="text-sm text-accent">{error}</p> : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Saving…" : "Enter Bridge"}
        </Button>
      </form>
    </main>
  );
}
