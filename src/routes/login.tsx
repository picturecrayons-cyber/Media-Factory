import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-bg p-6">
      <img
        src="/backdrops/jananam.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/80 to-bg" />
      <div className="relative w-full max-w-sm space-y-5 rounded-xl border border-line bg-elevated/90 p-6 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-8 w-8" />
          <span className="font-display tracking-[0.2em] text-loop uppercase">Loop</span>
        </Link>
        <h1 className="font-display text-2xl tracking-wide">Sign in</h1>
        <p className="text-sm text-muted">Cinema profiles, passes, and Mission Control.</p>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              className="h-12 w-full rounded-md border border-line-strong text-sm hover:bg-fg/8"
            >
              Continue with {p.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}
