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
        const isInternal = Boolean(actor.internalRole);
        return (
          <BridgeShell actor={actor} title="Account">
            <div className="max-w-2xl space-y-8">
              <section>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Profile</p>
                <div className="mt-4 divide-y divide-line border-y border-line">
                  <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]">
                    <span className="text-sm text-muted">Email</span>
                    <span className="text-sm font-medium">{actor.email}</span>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]">
                    <span className="text-sm text-muted">Account</span>
                    <span className="text-sm font-medium">{actor.accountType.replaceAll("_", " ")}</span>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]">
                    <span className="text-sm text-muted">Organization</span>
                    <span className="text-sm font-medium">{actor.organizationName ?? "—"}</span>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr]">
                    <span className="text-sm text-muted">Verification</span>
                    <span className="text-sm font-medium">{actor.emailVerified ? "Verified" : "Verification required"}</span>
                  </div>
                </div>

                {!actor.emailVerified ? (
                  <div className="mt-5">
                    <ResendVerify />
                  </div>
                ) : null}
              </section>

              {isInternal && (actor.internalRole === "admin" || actor.internalRole === "super_admin") ? (
                <section className="border-t border-line pt-6">
                  <Link to="/admin/workstations" className="flex min-h-12 items-center text-sm font-semibold">Operations</Link>
                </section>
              ) : null}

              <section className="border-t border-line pt-2">
                <Link to="/privacy" className="flex min-h-12 items-center border-b border-line text-sm">Privacy</Link>
                <Link to="/terms" className="flex min-h-12 items-center border-b border-line text-sm">Terms</Link>
                <Link to="/dmca" className="flex min-h-12 items-center border-b border-line text-sm">DMCA</Link>
                <Link to="/disclaimer" className="flex min-h-12 items-center border-b border-line text-sm">Disclaimer</Link>
                <Link to="/business" className="flex min-h-12 items-center border-b border-line text-sm">Business</Link>
                <Link to="/contact" className="flex min-h-12 items-center text-sm">Contact</Link>
              </section>
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
      {mut.isPending ? "Sending…" : "Send verification mail"}
    </Button>
  );
}
