import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { resetPasswordForEmail } from "@/lib/auth/client";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/forgot-password")({ component: Forgot });

function Forgot() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPasswordForEmail(email.trim());
      setDone(true);
    } catch (err: unknown) {
      console.error("[forgot password error]", err);
      // Display neutral confirmation message after submission as required by security guidelines
      setDone(true);
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
            Reset password
          </h1>
          <p className="mt-1 text-sm text-muted">
            Enter your email to receive a secure password reset link.
          </p>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <div className="rounded-xl border border-line bg-elevated p-4 text-sm leading-relaxed text-muted">
              If that mailbox has an account with Crayons Bridge, a password reset link has been sent. The link expires in two hours.
            </div>
            <Link to="/login" className="block">
              <Button variant="outline" className="w-full h-11 rounded-full text-sm">
                Return to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <label className="block text-sm font-medium text-fg">
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-sm text-fg placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
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
              {busy ? "Sending link…" : "Send reset link"}
            </Button>
          </form>
        )}

        <div className="border-t border-line pt-4 text-center text-sm text-muted">
          Remember your password?{" "}
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
