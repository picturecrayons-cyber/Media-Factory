import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { authEnabled, signInWithEmail } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { getBridgeSession } from "@/lib/bridge/session";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPending || !user) return;
    void getBridgeSession().then((s) => {
      const home = s.home;
      if (home === "/creator" || home === "/studio" || home === "/buyer" || home === "/internal") void navigate({ to: home });
      else void navigate({ to: "/onboarding" });
    }).catch(() => navigate({ to: "/onboarding" }));
  }, [isPending, user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      window.location.assign("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-5 rounded-md border border-line bg-surface p-6 shadow-sm">
        <BrandMark />
        <div className="space-y-1"><h1 className="font-display text-2xl">Sign in</h1><p className="text-sm text-muted">Securely access your Crayons Bridge workspace.</p></div>
        {authEnabled ? (
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <label className="block text-sm">Email<input required autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3" /></label>
            <label className="block text-sm"><span className="flex items-center justify-between gap-3"><span>Password</span><Link to="/forgot-password" className="font-medium text-accent underline-offset-4 hover:underline">Forgot password?</Link></span><input required autoComplete="current-password" type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3" /></label>
            {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        ) : <p className="text-sm text-muted">Sign-in is disabled.</p>}
        <div className="border-t border-line pt-4 text-center text-sm text-muted">New to Crayons Bridge? <Link to="/signup" className="font-medium text-accent underline-offset-4 hover:underline">Create account</Link></div>
      </div>
    </main>
  );
}
