import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { confirmPasswordReset } from "@/lib/bridge/profiles";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({ component: Reset });

function Reset() {
  const navigate = useNavigate();
  const token =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset({ data: { token, password } });
      navigate({ to: "/login" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-5 rounded-md border border-line bg-surface p-6 shadow-sm">
        <BrandMark />
        <div className="space-y-1">
          <h1 className="font-display text-2xl">Create a new password</h1>
          <p className="text-sm text-muted">Use at least 10 characters and keep this password unique to your account.</p>
        </div>
        {!token ? (
          <p role="alert" className="rounded-sm border border-line bg-elevated p-3 text-sm text-accent">
            This reset link is missing its secure token. Request a new password reset email.
          </p>
        ) : null}
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            New password
            <input
              required
              autoComplete="new-password"
              type={showPassword ? "text" : "password"}
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
            />
          </label>
          <label className="block text-sm">
            Confirm password
            <input
              required
              autoComplete="new-password"
              type={showPassword ? "text" : "password"}
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show passwords
          </label>
          {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
          <Button type="submit" disabled={busy || !token} className="w-full">
            {busy ? "Saving…" : "Update password"}
          </Button>
        </form>
        <Link to="/login" className="block text-center text-sm font-medium text-accent underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
