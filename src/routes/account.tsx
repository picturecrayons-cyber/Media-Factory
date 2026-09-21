import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { requestEmailVerification } from "@/lib/bridge/profiles";
import { getBridgePublicStatus } from "@/lib/bridge/session";
import { UserButton } from "@/lib/auth/gates";
import { TRANSACTIONAL_FROM } from "@/lib/bridge/canonical";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  const statusQ = useQuery({ queryKey: ["bridge-public-status"], queryFn: () => getBridgePublicStatus() });
  const mailConfigured = statusQ.data?.integrations.mail ?? false;
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} kicker="Account" title="Account">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-sm border border-line p-3">
              <dt className="text-muted">Account email</dt>
              <dd className="mt-1">{actor.email}</dd>
              <p className="mt-2 text-xs text-muted">Login identity. Not replaced by the Hostinger sender.</p>
            </div>
            <div className="rounded-sm border border-line p-3">
              <dt className="text-muted">Transactional sender</dt>
              <dd className="mt-1">{TRANSACTIONAL_FROM}</dd>
              <p className="mt-2 text-xs text-muted">
                Hostinger SMTP From address. Server-side only.
                {mailConfigured ? " Preview mail is bound." : " SMTP_PASS unset — send will fail closed."}
              </p>
            </div>
            <div className="rounded-sm border border-line p-3">
              <dt className="text-muted">Type</dt>
              <dd className="mt-1">{actor.accountType.replaceAll("_", " ")}</dd>
            </div>
            <div className="rounded-sm border border-line p-3">
              <dt className="text-muted">Organization</dt>
              <dd className="mt-1">{actor.organizationName ?? "—"}</dd>
            </div>
            <div className="rounded-sm border border-line p-3">
              <dt className="text-muted">Internal role</dt>
              <dd className="mt-1">{actor.internalRole?.replaceAll("_", " ") ?? "none"}</dd>
            </div>
            <div className="rounded-sm border border-line p-3">
              <dt className="text-muted">Email verified</dt>
              <dd className="mt-1">{actor.emailVerified ? "yes" : "no"}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ResendVerify verified={actor.emailVerified} />
            <UserButton />
            <Link to="/" className="text-sm text-accent underline-offset-4 hover:underline">
              Public landing
            </Link>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function ResendVerify({ verified }: { verified: boolean }) {
  const mut = useMutation({
    mutationFn: () => requestEmailVerification(),
    onSuccess: (res) => {
      if (res.sent) toast("Verification mail sent through Hostinger SMTP");
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Mail is not configured"),
  });
  return (
    <Button type="button" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate()}>
      {mut.isPending ? "Sending…" : verified ? "Resend verification mail" : "Send verification mail"}
    </Button>
  );
}