import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell, roleLabel } from "@/components/bridge/shell";
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
            <section className="max-w-xl overflow-hidden rounded-2xl border border-line bg-white">
              <Row label="Email" value={actor.email} />
              <Row label="Role" value={roleLabel(actor)} />
              <Row label="Organization" value={actor.organizationName || "Not set"} />
              <Row label="Verification" value={actor.emailVerified ? "Verified" : "Verification required"} />
              {!actor.emailVerified ? (
                <div className="border-t border-line px-4 py-4">
                  <ResendVerify />
                </div>
              ) : null}
              {isInternal && (actor.internalRole === "admin" || actor.internalRole === "super_admin") ? (
                <Link to="/admin/workstations" className="flex min-h-12 items-center border-t border-line px-4 text-sm font-semibold">Operations</Link>
              ) : null}
            </section>
            <nav aria-label="Legal" className="mt-6 grid max-w-xl gap-px overflow-hidden rounded-2xl border border-line bg-line md:hidden">
              <Link to="/privacy" className="bg-white px-4 py-3 text-sm">Privacy</Link>
              <Link to="/terms" className="bg-white px-4 py-3 text-sm">Terms</Link>
              <Link to="/dmca" className="bg-white px-4 py-3 text-sm">DMCA</Link>
              <Link to="/disclaimer" className="bg-white px-4 py-3 text-sm">Disclaimer</Link>
              <Link to="/business" className="bg-white px-4 py-3 text-sm">Business</Link>
              <Link to="/contact" className="bg-white px-4 py-3 text-sm">Contact</Link>
            </nav>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="truncate text-sm font-semibold">{value}</span>
    </div>
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
