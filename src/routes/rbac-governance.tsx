import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getSuperAdminRbacGovernance } from "@/lib/bridge/super-admin-rbac";

export const Route = createFileRoute("/rbac-governance")({ component: RbacGovernance });

function RbacGovernance() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="RBAC governance">
          <RbacGovernanceBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function RbacGovernanceBody() {
  const query = useQuery({
    queryKey: ["super-admin-rbac-governance"],
    queryFn: () => getSuperAdminRbacGovernance(),
    retry: false,
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Policy registry · read only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Role and permission matrix</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          This is the checked-in application policy, not a live inventory of assigned users. Staff roles and account entitlements are shown separately.
        </p>
      </section>

      {query.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading RBAC policy…</p>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">RBAC policy is unavailable.</p>
      ) : data ? (
        <>
          <section className="rounded-xl border border-line p-4 sm:p-5">
            <h3 className="font-semibold">Policy source and limits</h3>
            <p className="mt-2 text-sm text-muted">Source: {data.source}. User role assignments: {data.assignments}. Role mutation controls: {data.mutationControls}.</p>
            <p className="mt-2 text-sm text-muted">Email verification and server-side authorization remain mandatory. This matrix does not grant or change any user access.</p>
          </section>

          <section className="space-y-3">
            <div><h3 className="font-display text-lg font-semibold">Internal staff roles</h3><p className="text-xs text-muted">Permission sets and which internal roles each role may grant under the current application policy.</p></div>
            {data.internalRoles.map((role) => (
              <article key={role.role} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold">{role.role.replaceAll("_", " ")}</h4>
                  <span className="text-xs text-muted">{role.permissions.length} permissions</span>
                </div>
                <p className="mt-2 text-xs text-muted">May grant: {role.mayGrant.length ? role.mayGrant.join(", ") : "No internal roles"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {role.permissions.map((permission) => <span key={permission} className="rounded-full border border-line px-2.5 py-1 text-[11px]">{permission}</span>)}
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <div><h3 className="font-display text-lg font-semibold">External account entitlements</h3><p className="text-xs text-muted">These are account-type permissions, not internal staff roles.</p></div>
            {data.accountTypes.map((account) => (
              <article key={account.accountType} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold">{account.accountType.replaceAll("_", " ")}</h4>
                  <span className="text-xs text-muted">{account.permissions.length} permissions</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {account.permissions.map((permission) => <span key={permission} className="rounded-full border border-line px-2.5 py-1 text-[11px]">{permission}</span>)}
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
