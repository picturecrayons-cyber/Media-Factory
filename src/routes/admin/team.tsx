import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { inviteInternalRole } from "@/lib/bridge/profiles";
import { INTERNAL_ROLES } from "@/lib/bridge/types";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/admin/team")({ component: TeamAccess });

function TeamAccess() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const canInvite = hasPermission(actor, "users.invite_internal");
        const roles = INTERNAL_ROLES.filter((role) => role !== "super_admin" && (actor.internalRole === "super_admin" || role !== "admin"));
        return (
          <BridgeShell actor={actor} title="Team & Permissions">
            <div className="mx-auto max-w-5xl space-y-6">
              <header className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Internal access control</p>
                <h2 className="mt-1 font-display text-3xl font-semibold">Team & Permissions</h2>
                <p className="mt-2 max-w-3xl text-sm text-muted">Invite operational staff with only the access needed for their work. Role grants are checked again on the server.</p>
              </header>
              {canInvite ? <InviteForm roles={roles} /> : (
                <section className="rounded-2xl border border-line bg-surface p-5">
                  <h3 className="font-semibold">Invitation access required</h3>
                  <p className="mt-2 text-sm text-muted">Your current internal role cannot invite staff.</p>
                </section>
              )}
              <section className="grid gap-3 sm:grid-cols-2">
                <RoleCard title="Admin" detail="Operational coordination and approved internal workflows. Cannot create or grant Super Admin." />
                <RoleCard title="QC Reviewer" detail="Technical quality review and assigned QC decisions." />
                <RoleCard title="Legal Reviewer" detail="Rights and legal review access, without publishing authority." />
                <RoleCard title="Finance" detail="Finance and settlement visibility under assigned permissions." />
                <RoleCard title="Viewer" detail="Read-only catalog and permitted audit visibility." />
                <RoleCard title="Super Admin" detail="One designated owner-level control identity. Not available in invitations; assignment requires a separately audited owner-level process." />
              </section>
              <div className="flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
                <Link to="/admin/users" className="text-accent hover:underline">Verified user inventory →</Link>
                <Link to="/admin/audit" className="text-accent hover:underline">Audit & security →</Link>
                <Link to="/internal" className="text-accent hover:underline">Operations desk →</Link>
              </div>
            </div>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function InviteForm({ roles }: { roles: Array<(typeof INTERNAL_ROLES)[number]> }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INTERNAL_ROLES)[number]>("viewer");
  const mut = useMutation({
    mutationFn: () => inviteInternalRole({ data: { email, role } }),
    onSuccess: () => {
      toast.success("Internal invitation sent");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Invitation failed"),
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mut.mutate();
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
      <label className="block text-xs font-semibold text-muted">
        Team member email
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colleague@company.com" className="mt-2 h-11 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg" />
      </label>
      <label className="block text-xs font-semibold text-muted">
        Internal role
        <select value={role} onChange={(event) => setRole(event.target.value as (typeof INTERNAL_ROLES)[number])} className="mt-2 h-11 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg">
          {roles.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <Button type="submit" disabled={mut.isPending || !roles.includes(role)}>{mut.isPending ? "Sending…" : "Send invitation"}</Button>
      <p className="text-xs text-muted sm:col-span-3">Invitations expire after seven days. Super Admin cannot be granted through this form.</p>
    </form>
  );
}

function RoleCard({ title, detail }: { title: string; detail: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{detail}</p></article>;
}
