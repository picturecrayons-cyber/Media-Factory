import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { resendConfirmationEmail, signUpWithEmail } from "@/lib/auth/client";
import { classifySignupResult } from "@/lib/auth/signup-classification";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { role?: string } => ({
    role: typeof search.role === "string" ? search.role : undefined,
  }),
  component: Signup,
});

type AccountChoice = "independent_creator" | "studio" | "buyer";

function Signup() {
  const search = Route.useSearch();
  const initialChoice: AccountChoice =
    search.role === "studio"
      ? "studio"
      : search.role === "buyer"
      ? "buyer"
      : "independent_creator";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountChoice>(initialChoice);
  const [organizationName, setOrganizationName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Verification state
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

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
      const result = await signUpWithEmail({
        email: email.trim(),
        password,
        name: name.trim(),
        accountType,
      });

      const signupState = classifySignupResult(result);
      if (signupState === "session") {
        window.location.assign("/onboarding");
        return;
      }
      if (signupState === "existing") {
        setError("An account with this email address already exists. Please sign in or reset your password.");
        return;
      }
      setSubmittedEmail(email.trim());
    } catch (err: unknown) {
      console.error("[Signup error]", err);
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("User already registered") || message.includes("already registered")) {
        setError("An account with this email address already exists. Please sign in or reset your password.");
      } else if (message.includes("Password should be")) {
        setError(message);
      } else {
        setError(message || "Failed to create account. Please check your details.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!submittedEmail || cooldown > 0 || resendBusy) return;
    setResendBusy(true);
    setResendStatus(null);
    setError(null);

    try {
      await resendConfirmationEmail(submittedEmail);
      setResendStatus("A new confirmation email was requested. Check your inbox and spam folder.");
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("too many")) {
        setError("Please wait before requesting another confirmation email.");
      } else {
        setError("We couldn’t send the confirmation email. Please try again.");
      }
    } finally {
      setResendBusy(false);
    }
  }

  if (submittedEmail) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-7 text-center shadow-sm">
          <div className="flex flex-col items-center">
            <BrandMark />
            <div className="mt-4 grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold text-fg">
              Check your email
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              We requested a secure confirmation link for:
            </p>
            <p className="mt-1 text-base font-semibold text-fg">
              {submittedEmail}
            </p>
            <p className="mt-3 text-xs text-muted">
              Check your inbox and spam folder.
            </p>
            <p className="mt-1 text-xs text-faint">
              If it does not arrive, use:
            </p>
          </div>

          {resendStatus ? (
            <div
              role="status"
              className="rounded-xl border border-accent/20 bg-accent-soft p-3 text-sm text-accent"
            >
              {resendStatus}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={resendBusy || cooldown > 0}
              onClick={() => void handleResend()}
              className="w-full h-11 rounded-full text-sm font-semibold hover:border-line-strong"
            >
              {resendBusy
                ? "Sending…"
                : cooldown > 0
                ? `Resend available in ${cooldown}s`
                : "Resend confirmation email"}
            </Button>

            <Link
              to="/login"
              className="block text-sm text-muted underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-fg">
            Create an account
          </h1>
          <p className="mt-1 text-sm text-muted">
            Join Crayons Bridge to clear rights, license content, and distribute.
          </p>
        </div>

        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm font-medium text-fg">
            Full name
            <input
              required
              autoComplete="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First and last name"
              className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-sm text-fg placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="block text-sm font-medium text-fg">
            Email address
            <input
              required
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-sm text-fg placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-fg">I am a:</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "independent_creator", label: "Creator / Filmmaker" },
                { id: "studio", label: "Studio / Production" },
                { id: "buyer", label: "Buyer / Platform" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setAccountType(opt.id as AccountChoice)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center text-xs font-medium transition ${
                    accountType === opt.id
                      ? "border-accent bg-accent-soft text-accent font-semibold shadow-xs"
                      : "border-line bg-elevated text-muted hover:border-line-strong hover:text-fg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium text-fg">
            Password
            <input
              required
              autoComplete="new-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5 text-sm text-fg placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="block text-sm font-medium text-fg">
            Confirm password
            <input
              required
              autoComplete="new-password"
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
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
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div className="border-t border-line pt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
