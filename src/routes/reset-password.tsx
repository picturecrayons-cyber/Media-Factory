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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
      <div className="w-full max-w-sm space-y-5 rounded-md border border-line bg-surface p-6">
        <BrandMark />
        <h1 className="font-display text-2xl">New password</h1>
        <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
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
          <Button type="submit" disabled={busy || !token} className="w-full">
            {busy ? "Saving…" : "Update password"}
          </Button>
        </form>
        <Link to="/login" className="block text-sm text-accent underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
