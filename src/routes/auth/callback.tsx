import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { markRecoverySession, resendConfirmationEmail } from "@/lib/auth/client";
import { syncSupabaseSessionUser } from "@/lib/bridge/profiles";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    token_hash: typeof search.token_hash === "string" ? search.token_hash : undefined,
    type: typeof search.type === "string" ? search.type : undefined,
    next: typeof search.next === "string" ? search.next : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    error_description: typeof search.error_description === "string" ? search.error_description : undefined,
  }),
  component: AuthCallback,
});

/** Validates that redirect paths are strictly internal to prevent open redirect vulnerabilities */
function sanitizeNextPath(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    if (
      trimmed.startsWith("/dashboard") ||
      trimmed.startsWith("/onboarding") ||
      trimmed.startsWith("/workspace") ||
      trimmed.startsWith("/title/") ||
      trimmed.startsWith("/buyer") ||
      trimmed.startsWith("/account")
    ) {
      return trimmed;
    }
  }
  return null;
}

function AuthCallback() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resend state for recovery
  const [emailInput, setEmailInput] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let alive = true;

    async function verifyAccount() {
      try {
        if (typeof window === "undefined") return;

        // Check for error parameters passed back from Supabase
        if (search.error) {
          throw new Error(search.error_description || search.error);
        }

        // Also inspect URL query params directly in case router didn't catch them
        const url = new URL(window.location.href);
        const code = search.code || url.searchParams.get("code");
        const tokenHash = search.token_hash || url.searchParams.get("token_hash");
        const type = (search.type || url.searchParams.get("type")) as
          | "signup"
          | "email"
          | "recovery"
          | "invite"
          | "magiclink"
          | "email_change"
          | undefined;
        if (type === "recovery" && !tokenHash && !code && !new URLSearchParams(url.hash.slice(1)).get("access_token")) {
          throw new Error("Recovery callback is missing its secure token.");
        }

        // 1. Verify token hash via verifyOtp (preferred Supabase auth email confirmation path)
        if (tokenHash && type) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (otpError) throw otpError;
        } else if (code) {
          // 2. PKCE code exchange flow
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) throw codeError;
        }

        // 3. Confirm valid Supabase session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        let session = sessionData?.session;
        if (!session) {
          // Give brief moment for session token persistence
          await new Promise((r) => setTimeout(r, 600));
          const retry = await supabase.auth.getSession();
          session = retry.data?.session;
        }

        if (!session) {
          throw new Error("Unable to establish verified authentication session. Please sign in.");
        }

        // 4. Confirm user identity
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) {
          throw new Error("Could not verify user identity.");
        }

        if (!alive) return;
        setStatus("success");

        // 5. Handle password recovery redirect
        if (type === "recovery") {
          markRecoverySession(session.access_token);
          void navigate({ to: "/reset-password" });
          return;
        }

        // 6. Synchronize user profile & workspace RBAC
        const syncResult = await syncSupabaseSessionUser().catch((err) => {
          console.warn("[auth/callback] Profile sync warning:", err);
          return null;
        });

        if (!alive) return;

        // 7. Route to destination based on onboarding completion and safe next parameter
        const safeNext = sanitizeNextPath(search.next || url.searchParams.get("next") || undefined);

        if (syncResult?.isComplete && syncResult.profile) {
          void navigate({ to: safeNext || syncResult.home || "/dashboard" });
        } else {
          void navigate({ to: "/onboarding" });
        }
      } catch (err: unknown) {
        console.error("[auth/callback verification error]", err);
        if (!alive) return;
        setStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(
          msg.includes("expired") || msg.includes("invalid") || msg.includes("Token has expired")
            ? "This confirmation link has expired or has already been used."
            : msg || "Failed to verify account."
        );
      }
    }

    void verifyAccount();

    return () => {
      alive = false;
    };
  }, [navigate, search]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInput || cooldown > 0 || resendBusy) return;
    setResendBusy(true);
    setResendMessage(null);
    try {
      await resendConfirmationEmail(emailInput.trim());
      setResendMessage("A new confirmation email was requested. Check your inbox and spam folder.");
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
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many")) {
        setResendMessage("Please wait before requesting another confirmation email.");
      } else {
        setResendMessage("We couldn’t send the confirmation email. Please try again.");
      }
    } finally {
      setResendBusy(false);
    }
  }

  if (status === "verifying") {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
          <BrandMark />
          <div className="flex flex-col items-center pt-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
            <h1 className="mt-4 font-display text-xl font-semibold text-fg">
              Verifying your account…
            </h1>
            <p className="mt-1 text-sm text-muted">
              Establishing your verified Crayons Bridge session.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
          <BrandMark />
          <div className="flex flex-col items-center pt-2">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="mt-3 font-display text-xl font-semibold text-fg">
              Account Verified
            </h1>
            <p className="mt-1 text-sm text-muted">
              Entering your Crayons Bridge workspace…
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-8 shadow-xs">
        <div className="text-center">
          <BrandMark />
          <div className="mt-4 grid h-10 w-10 mx-auto place-items-center rounded-full bg-red-500/10 text-red-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 7.5h.01" />
            </svg>
          </div>
          <h1 className="mt-3 font-display text-2xl font-semibold text-fg">
            This confirmation link has expired.
          </h1>
          <p className="mt-2 text-sm text-muted">
            {errorMessage || "Please request a new confirmation email to activate your workspace."}
          </p>
        </div>

        <form onSubmit={handleResend} className="space-y-3 pt-2">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
            Email address
            <input
              type="email"
              required
              placeholder="Enter your email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </label>

          {resendMessage ? (
            <p className="rounded-xl border border-accent/20 bg-accent-soft p-2.5 text-xs text-accent text-center">
              {resendMessage}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={resendBusy || cooldown > 0 || !emailInput}
            className="w-full h-10 rounded-full text-xs font-semibold"
          >
            {resendBusy
              ? "Sending…"
              : cooldown > 0
              ? `Resend available in ${cooldown}s`
              : "Send a new confirmation email"}
          </Button>
        </form>

        <div className="border-t border-line pt-4 text-center">
          <Link
            to="/login"
            className="text-xs font-medium text-muted hover:text-fg transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
