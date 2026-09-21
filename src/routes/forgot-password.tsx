import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { requestPasswordReset } from "@/lib/bridge/profiles";
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
      await requestPasswordReset({ data: { email } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset mail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-5 rounded-md border border-line bg-surface p-6">
        <BrandMark />
        <h1 className="font-display text-2xl">Reset password</h1>
        {done ? (
          <p className="text-sm leading-relaxed text-muted">
            If that mailbox has an account, a reset link is on its way. The link expires in two hours.
          </p>
        ) : (
          <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
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
            {error ? <p className="text-sm text-accent">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <Link to="/login" className="block text-sm text-accent underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
