import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/auth/confirm")({
  component: AuthConfirmAlias,
});

/** Forward legacy /auth/confirm traffic directly to canonical /auth/callback */
function AuthConfirmAlias() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = window.location.search || "";
      const hash = window.location.hash || "";
      // Canonical redirect to /auth/callback preserving tokens and query params
      window.location.replace(`/auth/callback${search}${hash}`);
    }
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
        <div className="flex flex-col items-center pt-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <h1 className="mt-4 font-display text-xl font-semibold text-fg">
            Verifying account…
          </h1>
          <p className="mt-1 text-sm text-muted">
            Routing to canonical authentication callback.
          </p>
        </div>
      </div>
    </main>
  );
}
