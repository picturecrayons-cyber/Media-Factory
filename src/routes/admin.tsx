import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles, listAuditLogs } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { listAdminProfiles } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/admin")({ component: AdminControlPlane });

const modules = [
  ["Incoming Submissions", "Submission review persistence is not enabled yet. Review actions remain unavailable until the dedicated backend workflow is approved.", null],
  ["Operational CMS", "Direct ingest, licensing readiness and Loop publishing from one Bridge surface.", "/cms"],
  ["Titles & Assets", "Review canonical title and asset records without entering Creator/Studio submission mode.", "/cms"],
  ["Assets & QC", "Masters, artwork, subtitles, audio, technical review and preparation.", "/cms"],
  ["Legal & Rights", "Ownership, territories, languages, windows and clearance gates.", "/cms"],
  ["Licensing", "Buyer discovery, screeners, negotiation and commercial controls.", "/buyer"],
  ["Deliveries", "Secure delivery, C2C handoff, package readiness and operational audit.", "/deliveries"],
  ["Users & Studios", "Inspect Bridge identities and organizations. Role changes remain unsupported without a dedicated audited API.", "/admin"],
  ["Audit History", "Review existing Bridge audit records.", "/admin"],
  ["Website CMS", "Edit the minimal public Bridge homepage copy.", "/admin-cms"],
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
  const controlPlaneError = titlesQ.isError || distQ.isError || profilesQ.isError || auditQ.isError;
  if (controlPlaneError) {
    return (
      <BridgeShell actor={actor} title="Admin Control Plane">
        <section role="alert" className="rounded-3xl border border-line bg-surface p-8">
          <h2 className="font-display text-2xl font-semibold">Control-plane data unavailable</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">Bridge could not load one or more authoritative admin datasets. No zero-value KPIs are being shown for unavailable data.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={() => { void titlesQ.refetch(); void distQ.refetch(); void profilesQ.refetch(); void auditQ.refetch(); }}>Retry</Button>
          </div>
        </section>
      </BridgeShell>
    );
  }

  const titles = titlesQ.data?.titles ?? [];
  const distribution = distQ.data?.titles ?? [];
  const profiles = profilesQ.data?.profiles ?? [];
  const organizations = new Set(profiles.map((p) => p.organizationName).filter(Boolean));
  const qcQueue = titles.filter((t) => t.status === "PREPARING" || t.status === "QC_REVIEW").length;
  const rightsQueue = titles.filter((t) => t.status === "RIGHTS_REVIEW").length;
  const buyerReady = titles.filter((t) => ["LICENSING_READY","LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED"].includes(t.status)).length;
  const loopReadyTitles = distribution.filter((t) => t.ready && !t.publication?.published);
  const loopReady = loopReadyTitles.length;
  const live = distribution.filter((t) => t.publication?.published).length;
  const attentionTitleIds = new Set([
    ...titles.filter((t) => t.status === "PREPARING" || t.status === "QC_REVIEW" || t.status === "RIGHTS_REVIEW").map((t) => t.id),
    ...loopReadyTitles.map((t) => t.id),
  ]);
  const attentionTitles = titles.filter((t) => attentionTitleIds.has(t.id));

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
            <Button type="button" variant="outline" disabled title="Loop CMS requires independent server-authoritative authorization">Loop CMS unavailable</Button>
            <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer"><Button variant="outline">Open Crayons Loop ↗</Button></a>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        {[
          ["Total Titles", titles.length, "Canonical catalog"],
          ["QC Queue", qcQueue, "Prepare / QC review"],
          ["Rights Queue", rightsQueue, "Legal clearance"],
          ["Buyer Ready", buyerReady, "Licensing pipeline"],
          ["Loop Live", live, "Published Loop records"],
          ["Users", profiles.length, "Bridge profiles"],
          ["Organizations", organizations.size, "Studio / buyer organizations"],
        ].map(([label, value, caption]) => (
          <article key={String(label)} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted">{caption}</p>
          </article>
        ))}
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Operations map</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Admin workstations</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {modules.map(([name, description, to]) => to ? (
            <Link key={name} to={to} className="group rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-display text-lg font-semibold">{name}</h4>
                <span className="text-accent transition group-hover:translate-x-1">→</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
            </Link>
          ) : (
            <article key={name} className="rounded-2xl border border-line bg-surface p-5 opacity-75">
              <div className="flex items-start justify-between gap-3"><h4 className="font-display text-lg font-semibold">{name}</h4><span className="rounded-full border border-line px-2 py-1 text-[10px] uppercase text-muted">Unavailable</span></div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
            </article>
          ))}
        </div>
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
            {attentionTitles.slice(0,8).map((t) => (
              <Link key={t.id} to="/title/$id" params={{ id: t.id }} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-elevated p-4 hover:border-line-strong">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{t.status.replaceAll("_", " ")}</p>
                </div>
                <span className="text-sm text-accent">Open →</span>
              </Link>
            ))}
            {!attentionTitles.length ? <p className="py-8 text-center text-sm text-muted">No titles currently require admin attention.</p> : null}
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
