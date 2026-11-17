import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listSuperAdminOrganizationGovernance } from "@/lib/bridge/super-admin-organizations";

export const Route = createFileRoute("/organization-governance")({ component: OrganizationGovernance });

function OrganizationGovernance() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Organization governance">
          <OrganizationGovernanceBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function OrganizationGovernanceBody() {
  const query = useQuery({
    queryKey: ["super-admin-organization-governance"],
    queryFn: () => listSuperAdminOrganizationGovernance(),
    retry: false,
  });
  const organizations = query.data?.organizations ?? [];
  const memberships = query.data?.memberships ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Governance · read only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Organizations & memberships</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Displays only canonical organization and membership records. Organization names are not treated as proof of ownership, and no memberships or invitations are created here.
        </p>
      </section>

      {query.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading organization records…</p>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">
          Organization data is unavailable. The organization schema or server data source could not be verified; no empty-state assumption is made.
        </p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <Metric label="Organizations" value={organizations.length.toLocaleString("en-IN")} />
            <Metric label="Membership records" value={memberships.length.toLocaleString("en-IN")} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Canonical organizations</h3>
              <p className="mt-1 text-xs text-muted">Latest 200 records; membership counts include all recorded statuses.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr><th className="px-4 py-3">Legal name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Created</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {organizations.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3"><p className="font-medium">{row.legalName}</p><p className="mt-1 font-mono text-[10px] text-muted">{row.id}</p></td>
                      <td className="px-4 py-3">{row.status}</td>
                      <td className="px-4 py-3 tabular-nums">{row.memberCount}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                  {!organizations.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No organization records are currently available.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Membership records</h3>
              <p className="mt-1 text-xs text-muted">Account email and identity-provider credentials are not exposed.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Member</th><th className="px-4 py-3">Account type</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {memberships.map((row) => (
                    <tr key={row.userReference + row.organizationId}>
                      <td className="px-4 py-3">{row.organizationName}</td>
                      <td className="px-4 py-3"><p className="font-medium">{row.displayName}</p><p className="mt-1 font-mono text-[10px] text-muted">{row.userReference}</p></td>
                      <td className="px-4 py-3">{row.accountType}</td>
                      <td className="px-4 py-3">{row.role}</td>
                      <td className="px-4 py-3">{row.status}</td>
                    </tr>
                  ))}
                  {!memberships.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No membership records are currently available.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Invitation and ownership boundaries</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• Invitation workflow: NOT IMPLEMENTED.</li>
          <li>• No email, SMS or external invitation is sent.</li>
          <li>• Legal ownership requires independent evidence and review.</li>
          <li>• Membership creation, suspension and removal require a separate audited write workflow and approval.</li>
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></article>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-IN");
}
