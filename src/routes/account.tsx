import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { requestEmailVerification } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  return (
    <RequireBridge>
      {(actor) => {
        const bridgeAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        return (
          <BridgeShell actor={actor} title="Account & Settings">
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-line bg-surface p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Personal profile</p>
                <dl className="mt-4 grid gap-4 text-sm">
                  <div><dt className="text-muted">Mailbox</dt><dd className="mt-1">{actor.email}</dd></div>
                  <div><dt className="text-muted">Account type</dt><dd className="mt-1">{actor.accountType.replaceAll("_", " ")}</dd></div>
                  <div><dt className="text-muted">Organization</dt><dd className="mt-1">{actor.organizationName ?? "—"}</dd></div>
                  <div><dt className="text-muted">Verification</dt><dd className="mt-1">{actor.emailVerified ? "Verified" : "Verification required"}</dd></div>
                </dl>
                {!actor.emailVerified ? <div className="mt-5"><ResendVerify /></div> : null}
              </div>

              <div className="rounded-3xl border border-line bg-surface p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Administrative access</p>
                <dl className="mt-4 grid gap-4 text-sm">
                  <div><dt className="text-muted">Bridge internal role</dt><dd className="mt-1">{actor.internalRole?.replaceAll("_", " ") ?? "Not authorized"}</dd></div>
                  <div><dt className="text-muted">Bridge Admin</dt><dd className="mt-1">{bridgeAdmin ? "Authorized" : "Not authorized"}</dd></div>
                  <div><dt className="text-muted">Loop CMS</dt><dd className="mt-1">{bridgeAdmin ? "Available through Bridge CMS" : "Managed by Bridge administrators"}</dd></div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-3">
                  {bridgeAdmin ? <Link to="/admin"><Button>Open Bridge Admin</Button></Link> : null}
                  {bridgeAdmin ? <Link to="/cms"><Button variant="outline">Open Loop CMS in Bridge</Button></Link> : null}
                </div>
              </div>
            </section>

            <div className="mt-6">
              <Link to="/" className="text-sm text-accent underline-offset-4 hover:underline">Public landing</Link>
            </div>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function ResendVerify() {
  const mut = useMutation({
    mutationFn: () => requestEmailVerification(),
    onSuccess: () => toast("Verification mail requested"),
    onError: (err) => toast(err instanceof Error ? err.message : "Mail is not configured"),
  });
  return (
    <Button type="button" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate()}>
      Send verification mail
    </Button>
  );
}
