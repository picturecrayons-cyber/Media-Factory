import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { requestEmailVerification } from "@/lib/bridge/profiles";
import { UserButton } from "@/lib/auth/gates";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Account">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-sm border border-line p-4">
              <dt className="text-muted">Mailbox</dt>
              <dd className="mt-1">{actor.email}</dd>
            </div>
            <div className="rounded-sm border border-line p-4">
              <dt className="text-muted">Type</dt>
              <dd className="mt-1">{actor.accountType.replaceAll("_", " ")}</dd>
            </div>
            <div className="rounded-sm border border-line p-4">
              <dt className="text-muted">Organization</dt>
              <dd className="mt-1">{actor.organizationName ?? "—"}</dd>
            </div>
            <div className="rounded-sm border border-line p-4">
              <dt className="text-muted">Internal role</dt>
              <dd className="mt-1">{actor.internalRole?.replaceAll("_", " ") ?? "none"}</dd>
            </div>
            <div className="rounded-sm border border-line p-4">
              <dt className="text-muted">Email verified</dt>
              <dd className="mt-1">{actor.emailVerified ? "yes" : "no"}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ResendVerify />
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
