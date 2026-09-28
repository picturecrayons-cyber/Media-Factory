import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { signInWithEmail } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { getBridgeSession } from "@/lib/bridge/session";

export const Route = createFileRoute("/login")({ component: Login });

function isSafeRedirect(url: string | null): boolean {
  if (!url) return false;
  // Allow only safe relative internal paths starting with /
  return url.startsWith("/") && !url.startsWith("//") && !url.includes("://");
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If already authenticated with Supabase session, resolve profile and route to dashboard
  useEffect(() => {
    if (isPending || !user) return;
    void getBridgeSession()
      .then((s) => {
        const nextParam =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("next")
            : null;
        if (isSafeRedirect(nextParam)) {
          void navigate({ to: nextParam! });
        } else {
          void navigate({ to: s.home || "/dashboard" });
        }
      })
      .catch(() => {
        void navigate({ to: "/onboarding" });
      });
  }, [isPending, user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await signInWithEmail(email.trim(), password);
      // Session established; let the useEffect resolve profile or route
      const s = await getBridgeSession().catch(() => null);
      const nextParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;

      if (isSafeRedirect(nextParam)) {
        window.location.assign(nextParam!);
      } else if (s?.home) {
        window.location.assign(s.home);
      } else {
        window.location.assign("/dashboard");
      }
    } catch (err: unknown) {
      console.error("[Login error]", err);
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("Invalid login credentials") || message.includes("invalid_grant")) {
        setError("Invalid email or password.");
      } else if (message.includes("Email not confirmed")) {
        setError("Email not verified. Please check your inbox for the confirmation link.");
      } else if (message.includes("fetch") || message.includes("NetworkError")) {
        setError("Network failure. Please check your connection and try again.");
      } else if (message.includes("Supabase") || message.includes("configured") || message.includes("configuration")) {
        setError("Sign in is temporarily unavailable. Please try again shortly.");
      } else {
        setError(message || "Sign in failed. Please try again.");
      }
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-fg">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-muted">
            Securely access your Crayons Bridge workspace.
          </p>
        </div>

        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm font-medium text-fg">
            Email
            <input
              required
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-sm text-fg placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="block text-sm font-medium text-fg">
            <span className="flex items-center justify-between gap-3">
              <span>Password</span>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-accent underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </span>
            <div className="relative mt-1.5">
              <input
                required
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 pr-11 text-sm text-fg placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-fg"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.7a2 2 0 002.7 2.7" />
                    <path d="M9.9 4.2A10.7 10.7 0 0112 4c5.5 0 9 5 9 5a16 16 0 01-3.1 3.8M6.2 6.2C4.1 7.5 3 9 3 9s3.5 5 9 5c1 0 1.9-.2 2.7-.4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-full font-semibold shadow-sm transition active:scale-[0.98]"
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="border-t border-line pt-4 text-center text-sm text-muted">
          New to Crayons Bridge?{" "}
          <Link
            to="/signup"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
