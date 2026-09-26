import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const invite =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") : null;
    if (invite) {
      try {
        sessionStorage.setItem("bridge-invite", invite);
      } catch {
        /* ignore */
      }
    }

    try {
      const res = await authClient.signUp.email({ email, password, name, callbackURL: "/onboarding" });
      if (res.error) {
        setError(res.error.message ?? "Sign-up failed");
        return;
      }

      // A successful sign-up may establish the Better Auth session via an
      // HttpOnly Set-Cookie response. A client-side router transition can keep
      // the pre-sign-up useSession cache alive and make onboarding look stuck.
      // Force one same-origin document navigation so the protected workspace
      // starts from the session the server just established.
      if (typeof window !== "undefined") {
        window.location.assign("/onboarding");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-5 rounded-md border border-line bg-surface p-6">
        <BrandMark />
        <h1 className="font-display text-2xl">Create an account</h1>
        <p className="text-sm text-muted">
          Independent creator, studio, or buyer — chosen after email. Internal desks require an invite.
        </p>
        {authEnabled ? (
          <>
            <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
              <label className="block text-sm">
                Name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
                />
              </label>
              <label className="block text-sm">
                Email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
                />
              </label>
              <label className="block text-sm">
                Password
                <input
                  required
                  type="password"
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
                />
              </label>
              {error ? <p className="text-sm text-accent">{error}</p> : null}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Creating…" : "Create account"}
              </Button>
            </form>
            <div className="space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <button
                  key={p.providerId}
                  type="button"
                  onClick={() => signIn(p.providerId, { callbackURL: "/onboarding" })}
                  className="h-11 w-full rounded-sm border border-line-strong text-sm hover:bg-fg/8"
                >
                  Continue with {p.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link to="/login" className="block text-sm text-accent underline-offset-4 hover:underline">
          Already have an account
        </Link>
      </div>
    </main>
  );
}
