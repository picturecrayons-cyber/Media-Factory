import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { requestEmailVerification, updateAdminProfile } from "@/lib/bridge/profiles";

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

                {actor.internalRole === "super_admin" ? <OrganizationEditor userId={actor.userId} displayName={actor.displayName} organizationName={actor.organizationName} /> : null}

                {!actor.emailVerified ? (
                  <div className="mt-5">
                    <ResendVerify />
                  </div>
                ) : null}
              </section>

              {isInternal ? (
                <section className="border-t border-line pt-8">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Internal access</p>
                  <p className="mt-2 text-sm text-muted">
                    {actor.internalRole?.replaceAll("_", " ")}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {actor.internalRole === "admin" || actor.internalRole === "super_admin" ? (
                      <Link to="/admin"><Button>Open Admin</Button></Link>
                    ) : null}
                    {actor.internalRole === "super_admin" ? (
                      <Link to="/cms"><Button variant="outline">Open CMS</Button></Link>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <Link to="/" className="inline-block text-sm font-medium text-accent hover:text-accent-strong">
                Back to Bridge
              </Link>
            </div>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function OrganizationEditor({ userId, displayName, organizationName }: { userId: string; displayName: string; organizationName: string | null }) {
  const initialOrganization = organizationName ?? "StreamVista OPC PVT LTD";
  const [organization, setOrganization] = useState(initialOrganization);
  const [savedOrganization, setSavedOrganization] = useState(initialOrganization);
  const mutation = useMutation({
    mutationFn: () => updateAdminProfile({ data: { userId, displayName, organizationName: organization.trim() || null } }),
    onSuccess: () => {
      setSavedOrganization(organization.trim());
      toast.success("Organization saved.");
      window.location.reload();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update organization"),
  });
  return <div className="mt-4 rounded-xl border border-line bg-elevated/30 p-4">
    <p className="text-sm font-semibold">Super Admin · Organization</p>
    <p className="mt-1 text-xs text-muted">Update the organization on this verified profile. Saving is audited; this does not change title ownership or permissions.</p>
    <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <label className="flex-1 text-xs text-muted">Organization name<input value={organization} onChange={(event) => setOrganization(event.target.value)} required maxLength={120} className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg" /></label>
      <div className="flex items-end"><Button type="submit" disabled={mutation.isPending || organization.trim() === savedOrganization} className="h-10">{mutation.isPending ? "Saving…" : organization.trim() === savedOrganization ? "Saved" : "Save organization"}</Button></div>
    </form>
  </div>;
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
