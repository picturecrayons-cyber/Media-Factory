import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { updatePassword } from "@/lib/auth/client";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({ component: Reset });

function Reset() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let alive = true;
    async function checkSession() {
      if (typeof window === "undefined") return;

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch (err) {
          console.warn("[reset-password] exchangeCode error:", err);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (alive) {
        setSessionReady(Boolean(data.session));
      }
    }

    void checkSession();
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setBusy(true);

    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => {
        void navigate({ to: "/login" });
      }, 2000);
    } catch (err: unknown) {
      console.error("[reset-password error]", err);
      const message = err instanceof Error ? err.message : "Failed to update password.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-fg">
            Create a new password
          </h1>
          <p className="mt-1 text-sm text-muted">
            Enter and confirm your new secure password.
          </p>
        </div>

        {success ? (
          <div className="space-y-3 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent mx-auto">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-fg">Password updated!</h2>
            <p className="text-sm text-muted">Redirecting you to sign in…</p>
            <Link to="/login" className="block pt-2">
              <Button className="w-full h-11 rounded-full text-sm">Sign in now</Button>
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            {!sessionReady ? (
              <p className="rounded-xl border border-line bg-elevated p-3 text-xs text-muted">
                Make sure you opened this page from the password reset email link.
              </p>
            ) : null}

            <label className="block text-sm font-medium text-fg">
              New password
              <input
                required
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-sm text-fg transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="block text-sm font-medium text-fg">
              Confirm password
              <input
                required
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-sm text-fg transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="rounded border-line-strong text-accent focus:ring-accent"
              />
              Show passwords
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
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}

        <div className="border-t border-line pt-4 text-center text-sm text-muted">
          <Link
            to="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
