import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { signInWithEmail } from "@/lib/auth/client";
import { resolvePostLoginDestination } from "@/lib/auth/sign-in-gate";
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

  // Preserve the existing authenticated-session and role-aware routing behaviour.
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
      const s = await getBridgeSession().catch(() => null);
      const nextParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;

      window.location.assign(
        resolvePostLoginDestination({ next: nextParam, sessionHome: s?.home }),
      );
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
    <main className="min-h-screen bg-[#071724] p-3 sm:p-5 lg:grid lg:place-items-center lg:p-8">
      <div className="mx-auto grid min-h-[min(760px,calc(100vh-4rem))] w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_32px_100px_rgba(0,0,0,0.35)] lg:grid-cols-[1.04fr_0.96fr]">
        <section className="relative isolate flex min-h-[270px] flex-col justify-between overflow-hidden bg-[#09283a] px-6 py-7 text-white sm:px-9 sm:py-9 lg:min-h-[700px] lg:px-12 lg:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full border border-cyan-100/10" />
            <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full border border-cyan-100/10" />
            <div className="absolute -bottom-44 -left-24 h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(4,18,29,0.15),transparent_55%,rgba(0,150,180,0.12))]" />
          </div>

          <div className="relative">
            <div className="inline-flex rounded-xl bg-white px-4 py-2 shadow-lg shadow-black/10">
              <BrandMark />
            </div>
            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-cyan-100/20 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100 sm:mt-12">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              Private B2B workspace
            </p>
            <h1 className="mt-5 max-w-xl font-display text-3xl font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-[3.35rem]">
              Every story deserves a clear path to the world.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
              One secure workspace for content, rights, licensing and delivery — built for the people who bring stories to market.
            </p>
          </div>

          <div className="relative mt-8 hidden max-w-lg grid-cols-2 gap-3 sm:grid">
            {[
              ["01", "Prepare", "Content & quality"],
              ["02", "Protect", "Rights & approvals"],
              ["03", "License", "Buyers & agreements"],
              ["04", "Deliver", "Secure handover"],
            ].map(([number, label, detail]) => (
              <div key={number} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm">
                <span className="text-[10px] font-semibold tracking-[0.18em] text-cyan-200">{number}</span>
                <p className="mt-2 text-sm font-semibold text-white">{label}</p>
                <p className="mt-1 text-xs text-slate-400">{detail}</p>
              </div>
            ))}
          </div>

          <p className="relative mt-6 text-[11px] tracking-wide text-slate-400">
            CRAYONS BRIDGE <span className="mx-2 text-cyan-300/70">/</span> PREPARE. PROTECT. LICENSE. DELIVER.
          </p>
        </section>

        <section className="flex items-center justify-center bg-white px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#007291]">Welcome back</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Sign in to Bridge
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Access your workspace securely with your registered email.
              </p>
            </div>

            <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
              <label className="block text-sm font-semibold text-slate-700">
                Email address
                <input
                  required
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#007291] focus:bg-white focus:ring-4 focus:ring-cyan-800/10"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                <span className="flex items-center justify-between gap-3">
                  <span>Password</span>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-[#007291] underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </span>
                <div className="relative mt-2">
                  <input
                    required
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#007291] focus:bg-white focus:ring-4 focus:ring-cyan-800/10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-400 transition hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007291]"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.7a2 2 0 002.7 2.7" />
                        <path d="M9.9 4.2A10.7 10.7 0 0112 4c5.5 0 9 5 9 5a16 16 0 01-3.1 3.8M6.2 6.2C4.1 7.5 3 9 3 9s3.5 5 9 5c1 0 1.9-.2 2.7-.4" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
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
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-[#007291] font-semibold text-white shadow-lg shadow-cyan-900/15 transition hover:bg-[#005f78] active:scale-[0.99]"
              >
                {busy ? "Signing in…" : "Sign in securely"}
              </Button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
              New to Crayons Bridge?{" "}
              <Link
                to="/signup"
                className="font-semibold text-[#007291] underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </div>
            <p className="mt-8 text-center text-[11px] leading-5 text-slate-400">
              Your account access is protected by role-based permissions and verified identity.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
