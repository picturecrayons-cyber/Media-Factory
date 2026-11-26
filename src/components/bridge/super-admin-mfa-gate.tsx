import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type GateState = "checking" | "enroll" | "challenge" | "ready" | "error";

export function SuperAdminMfaGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    setState("checking");
    setError(null);
    setCode("");
    try {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (assurance.data.currentLevel === "aal2") {
        setState("ready");
        return;
      }

      const listed = await supabase.auth.mfa.listFactors();
      if (listed.error) throw listed.error;
      const verified = listed.data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        const challenge = await supabase.auth.mfa.challenge({ factorId: verified.id });
        if (challenge.error) throw challenge.error;
        setFactorId(verified.id);
        setChallengeId(challenge.data.id);
        setState("challenge");
        return;
      }

      // A previous incomplete setup has no verified factor. Remove only those
      // unverified TOTP factors before issuing a fresh QR/secret to this session.
      for (const pending of listed.data.totp.filter((factor) => factor.status !== "verified")) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: pending.id });
        if (removed.error) throw removed.error;
      }

      const enrolled = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "StreamVista Platform Super Admin",
      });
      if (enrolled.error) throw enrolled.error;
      setFactorId(enrolled.data.id);
      setQrCode(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
      setState("enroll");
    } catch {
      setError("Multi-factor authentication could not be initialized. Retry after confirming the account is signed in.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function verifyCode() {
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      let activeChallengeId = challengeId;
      if (!activeChallengeId) {
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) throw challenge.error;
        activeChallengeId = challenge.data.id;
      }
      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: activeChallengeId,
        code,
      });
      if (verified.error) throw verified.error;

      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data.currentLevel !== "aal2") {
        throw new Error("AAL2 not established");
      }
      setQrCode(null);
      setSecret(null);
      setState("ready");
    } catch {
      setError("The authenticator code was not accepted. Check the code and try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (state === "ready") return <>{children}</>;

  return (
    <section className="mx-auto mt-8 w-full max-w-xl rounded-2xl border border-line bg-surface p-6 sm:p-8" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">StreamVista Security</p>
      <h2 className="mt-2 font-display text-2xl font-semibold">Super Admin multi-factor authentication</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        A verified authenticator factor is required before Super Admin dashboards, ingest and administrative actions can be used.
      </p>

      {state === "checking" ? <p className="mt-6 text-sm text-muted">Checking authenticator status…</p> : null}

      {state === "enroll" ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm">Scan this QR code with your authenticator app, then enter its current six-digit code.</p>
          {qrCode ? <img src={qrCode} alt="Super Admin authenticator setup QR code" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" /> : null}
          {secret ? (
            <div className="rounded-lg border border-line bg-elevated p-3">
              <p className="text-xs text-muted">Manual setup key</p>
              <code className="mt-1 block break-all text-sm">{secret}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      {state === "challenge" ? (
        <p className="mt-6 text-sm">Enter the six-digit code from your enrolled authenticator app.</p>
      ) : null}

      {state === "enroll" || state === "challenge" ? (
        <div className="mt-5 space-y-3">
          <label htmlFor="super-admin-mfa-code" className="block text-sm font-medium">Authenticator code</label>
          <input
            id="super-admin-mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded-lg border border-line bg-bg px-4 py-3 text-lg tracking-[0.35em]"
            placeholder="000000"
          />
          <Button type="button" disabled={busy || code.length !== 6} onClick={() => void verifyCode()}>
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-4 text-sm text-accent">{error}</p> : null}
      {state === "error" ? (
        <Button type="button" variant="outline" className="mt-4" onClick={() => void initialize()}>
          Retry MFA setup
        </Button>
      ) : null}
    </section>
  );
}
