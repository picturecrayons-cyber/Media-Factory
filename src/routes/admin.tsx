import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles, listAuditLogs } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { hasPermission } from "@/lib/bridge/rbac";
import { listAdminProfiles } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/admin")({ component: AdminControlPlane });

const groups = [
  ["Intake", [
    ["Incoming Submissions", "Title intake into QC.", "/admin/workstations"],
    ["Titles & Assets", "Canonical titles and masters.", "/admin/workstations"],
  ]],
  ["Clearance", [
    ["Assets & QC", "QC cases and reviewer decisions.", "/admin/workstations"],
    ["Legal & Rights", "Rights grants and clearance.", "/admin/workstations"],
  ]],
  ["Commercial", [
    ["Licensing", "Buyer pipeline and packages.", "/admin/workstations"],
    ["Deliveries", "Destination delivery state.", "/admin/workstations"],
    ["Operational CMS", "Loop publication controls.", "/admin/workstations"],
  ]],
  ["House", [
    ["Users & Studios", "Identities and organizations.", "/admin/workstations"],
    ["Audit History", "Operator activity.", "/admin/workstations"],
    ["Website CMS", "Public homepage copy.", "/admin/workstations"],
  ]],
] as const;

function AdminControlPlane() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        if (!isAdmin) {
          return (
            <BridgeShell actor={actor} title="Admin Control Plane">
              <section className="rounded-3xl border border-line bg-surface p-8">
                <h2 className="font-display text-2xl font-semibold">Admin access required</h2>
                <p className="mt-2 max-w-xl text-sm text-muted">This control plane is limited to Bridge administrators. Your operational workspace remains available from the sidebar.</p>
              </section>
            </BridgeShell>
          );
        }
        return <AdminBody actor={actor} />;
      }}
    </RequireBridge>
  );
}

function AdminBody({ actor }: { actor: any }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const auditQ = useQuery({ queryKey: ["bridge-audit"], queryFn: () => listAuditLogs() });
  const distQ = useQuery({ queryKey: ["loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness() });
  const profilesQ = useQuery({ queryKey: ["bridge-admin-profiles"], queryFn: () => listAdminProfiles() });
  const titles = titlesQ.data?.titles ?? [];
  const distribution = distQ.data?.titles ?? [];
  const profiles = profilesQ.data?.profiles ?? [];
  const organizations = new Set(profiles.map((p) => p.organizationName).filter(Boolean));
  const qcQueue = titles.filter((t) => t.status === "PREPARING" || t.status === "QC_REVIEW").length;
  const rightsQueue = titles.filter((t) => t.status === "RIGHTS_REVIEW").length;
  const buyerReady = titles.filter((t) => ["LICENSING_READY","LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED"].includes(t.status)).length;
  const loopReady = distribution.filter((t) => t.ready && !t.publication?.published).length;
  const live = distribution.filter((t) => t.publication?.published).length;

  return (
    <BridgeShell actor={actor} title="Admin Control Plane">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Master distribution · licensing · operations</p>
            <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Run the Bridge from one control plane.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">Accept creator and studio submissions, move titles through QC and legal clearance, prepare buyer discovery, authorize licensing, package delivery, and publish only approved destinations.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/cms"><Button>Open Bridge CMS</Button></Link>
            {actor.internalRole === "super_admin" ? <Link to="/cms"><Button type="button" variant="outline">Open Loop CMS in Bridge</Button></Link> : null}
            <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer"><Button variant="outline">Open Crayons Loop ↗</Button></a>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ["Titles", titles.length, "Catalog"],
          ["QC", qcQueue, "Queue"],
          ["Rights", rightsQueue, "Queue"],
          ["Buyer ready", buyerReady, "Pipeline"],
        ].map(([label, value, caption]) => (
          <article key={String(label)} className="rounded-sm border border-line p-4">
            <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted">{caption}</p>
          </article>
        ))}
      </section>
      <section className="mt-3 grid gap-3 sm:grid-cols-3">
        {[
          ["Loop live", live, "Publications"],
          ["Users", profiles.length, "Profiles"],
          ["Organizations", organizations.size, "Studios and buyers"],
        ].map(([label, value, caption]) => (
          <article key={String(label)} className="rounded-sm border border-line p-4">
            <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted">{caption}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 space-y-6">
        {groups.map(([group, items]) => (
          <div key={group}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{group}</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {items.map(([name, description, to]) => (
                <Link key={name} to={to} className="rounded-sm border border-line p-4 hover:border-accent">
                  <div className="flex items-center justify-between"><h4 className="font-semibold">{name}</h4><span className="text-accent">→</span></div>
                  <p className="mt-1 text-sm text-muted">{description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Users & organizations</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">Bridge identity inventory</h3>
            <p className="mt-1 text-xs text-muted">Authoritative Bridge profiles only. Role changes remain invite/onboarding controlled.</p>
          </div>
          <Link to="/internal"><Button variant="outline">Invite internal user</Button></Link>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Account</th><th className="px-3 py-3">Organization</th><th className="px-3 py-3">Internal role</th><th className="px-3 py-3">Verified</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {profiles.slice(0, 50).map((profile) => (
                <tr key={profile.userId}>
                  <td className="px-3 py-3"><p className="font-medium">{profile.displayName}</p><p className="text-xs text-muted">{profile.email}</p></td>
                  <td className="px-3 py-3">{profile.accountType.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3">{profile.organizationName ?? "—"}</td>
                  <td className="px-3 py-3">{profile.internalRole?.replaceAll("_", " ") ?? "—"}</td>
                  <td className="px-3 py-3">{profile.emailVerified ? "yes" : "no"}</td>
                </tr>
              ))}
              {!profiles.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No Bridge profiles found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Release pipeline</p>
              <h3 className="mt-1 font-display text-2xl font-semibold">Needs admin attention</h3>
            </div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{qcQueue + rightsQueue + loopReady} queued</span>
          </div>
          <div className="mt-5 space-y-3">
            {titles.filter((t) => t.status !== "DELIVERED").slice(0,8).map((t) => (
              <Link key={t.id} to="/title/$id" params={{ id: t.id }} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-elevated p-4 hover:border-line-strong">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{t.status.replaceAll("_", " ")}</p>
                </div>
                <span className="text-sm text-accent">Open →</span>
              </Link>
            ))}
            {!titles.length ? <p className="py-8 text-center text-sm text-muted">No titles in the pipeline yet.</p> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Audit</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Latest operator activity</h3>
          <ul className="mt-5 space-y-3">
            {(auditQ.data?.logs ?? []).slice(0,8).map((log) => (
              <li key={log.id} className="rounded-2xl border border-line bg-elevated p-3">
                <p className="text-sm font-medium">{log.action}</p>
                <p className="mt-1 text-xs text-muted">{log.entityType}:{log.entityId}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </BridgeShell>
  );
}
