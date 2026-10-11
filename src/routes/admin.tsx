import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles, listAuditLogs } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { listAdminProfiles } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/admin")({ component: AdminControlPlane });

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
  const [profileSearch, setProfileSearch] = useState("");
  const titles = titlesQ.data?.titles ?? [];
  const distribution = distQ.data?.titles ?? [];
  const profiles = profilesQ.data?.profiles ?? [];
  const normalizedProfileSearch = profileSearch.trim().toLocaleLowerCase();
  const filteredProfiles = profiles.filter((profile) => [profile.displayName, profile.email, profile.accountType, profile.organizationName ?? "", profile.internalRole ?? ""]
    .some((value) => value.toLocaleLowerCase().includes(normalizedProfileSearch)));
  // The current schema stores an organization label on each profile; it does not
  // define a canonical organizations or membership table. Do not present labels as
  // authoritative organization records or imply membership counts.
  const organizationLabels = new Set(profiles.map((p) => p.organizationName?.trim()).filter((name): name is string => Boolean(name)));
  const qcQueue = titles.filter((t) => t.status === "PREPARING" || t.status === "QC_REVIEW").length;
  const rightsQueue = titles.filter((t) => t.status === "RIGHTS_REVIEW").length;
  const buyerReady = titles.filter((t) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED"].includes(t.status)).length;
  const live = distribution.filter((t) => t.publication?.published).length;
  const attention = titles.filter((t) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(t.status)).slice(0, 6);

  return (
    <BridgeShell actor={actor} title="Admin Control Plane">
      <div className="space-y-6">
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Crayons Bridge · Operations</p>
              <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">One workspace. Clear next steps.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">Review submissions, clear QC and rights, prepare licensing, and authorize delivery from the canonical Bridge records. Publication stays blocked until its required gates pass.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/workstations"><Button>Open operational workspace</Button></Link>
              <Link to="/cms"><Button variant="outline">Open CMS</Button></Link>
              <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer"><Button variant="outline">Crayons Loop ↗</Button></a>
            </div>
          </div>
        </section>

        <section aria-label="Operational summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="All titles" value={titlesQ.isPending ? "—" : String(titles.length)} detail="Canonical catalog" />
          <Metric label="QC / intake" value={titlesQ.isPending ? "—" : String(qcQueue)} detail="Awaiting review" />
          <Metric label="Rights review" value={titlesQ.isPending ? "—" : String(rightsQueue)} detail="Clearance queue" />
          <Metric label="Buyer-ready pipeline" value={titlesQ.isPending ? "—" : String(buyerReady)} detail="Licensing stages" />
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <CompactMetric label="Loop publications" value={distQ.isPending ? "—" : String(live)} />
          <CompactMetric label="Bridge profiles" value={profilesQ.isPending ? "—" : String(profiles.length)} />
          <CompactMetric label="Named organization labels" value={profilesQ.isPending || profilesQ.isError ? "—" : String(organizationLabels.size)} />
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Action queue</p>
              <h3 className="mt-1 font-display text-2xl font-semibold">What needs attention</h3>
              <p className="mt-1 text-sm text-muted">Only titles in active intake, QC, rights, or licensing review are shown here.</p>
            </div>
            <Link to="/admin/workstations" className="text-sm font-semibold text-accent hover:underline">View all work →</Link>
          </div>
          <div className="mt-4 divide-y divide-line">
            {attention.map((title) => (
              <div key={title.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{title.name}</p>
                  <p className="mt-1 text-xs text-muted">{title.status.replaceAll("_", " ")}</p>
                </div>
                <Link to="/title/$id" params={{ id: title.id }} className="shrink-0 text-sm font-semibold text-accent hover:underline">Open title →</Link>
              </div>
            ))}
            {!titlesQ.isPending && attention.length === 0 ? <p className="py-6 text-sm text-muted">No titles are currently in these review stages.</p> : null}
            {titlesQ.isError ? <p role="alert" className="py-4 text-sm text-muted">The live title queue could not be loaded. Refresh to retry.</p> : null}
          </div>
        </section>

        <section aria-labelledby="users-organizations-heading" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 id="users-organizations-heading" className="font-display text-xl font-semibold">Users &amp; organization affiliations</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Persisted Bridge profiles only. Organization values below are profile labels, not verified organization memberships.
                Internal role assignment remains invite-controlled.
              </p>
            </div>
            <Link to="/internal" className="shrink-0"><Button variant="outline">Invite internal user</Button></Link>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="block w-full sm:max-w-md">
              <span className="sr-only">Search users and organization affiliations</span>
              <input
                type="search"
                value={profileSearch}
                onChange={(event) => setProfileSearch(event.target.value)}
                placeholder="Search name, email, role, account or organization…"
                aria-label="Search users and organization affiliations"
                className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
            <p className="text-sm text-muted" aria-live="polite">
              {profilesQ.isPending ? "Loading profiles…" : profilesQ.isError ? "Profile data unavailable" : `${filteredProfiles.length} of ${profiles.length} profiles`}
            </p>
          </div>

          {profilesQ.isPending ? (
            <div role="status" className="mt-4 rounded-xl border border-line px-4 py-8 text-center text-sm text-muted">Loading authoritative Bridge profiles…</div>
          ) : null}

          {profilesQ.isError ? (
            <div role="alert" className="mt-4 rounded-xl border border-red-500/40 px-4 py-5">
              <p className="font-medium">Users and organization affiliations could not be loaded.</p>
              <p className="mt-1 text-sm text-muted">This is a data-fetch error, not an empty result. No zero count is reported.</p>
              <div className="mt-3"><Button variant="outline" onClick={() => void profilesQ.refetch()}>Retry loading profiles</Button></div>
            </div>
          ) : null}

          {!profilesQ.isPending && !profilesQ.isError ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[29%]" />
                  <col className="w-[15%]" />
                  <col className="w-[23%]" />
                  <col className="w-[17%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead className="bg-background text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th scope="col" className="border-b border-line px-4 py-3 font-semibold">User</th>
                    <th scope="col" className="border-b border-line px-4 py-3 font-semibold">Public role</th>
                    <th scope="col" className="border-b border-line px-4 py-3 font-semibold">Organization label</th>
                    <th scope="col" className="border-b border-line px-4 py-3 font-semibold">Internal role</th>
                    <th scope="col" className="border-b border-line px-4 py-3 font-semibold">Email verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredProfiles.map((profile) => (
                    <tr key={profile.userId} className="align-top hover:bg-background/60">
                      <td className="break-words px-4 py-3">
                        <p className="font-medium">{profile.displayName || "Name unavailable"}</p>
                        <p className="mt-1 break-all text-xs text-muted">{profile.email}</p>
                      </td>
                      <td className="break-words px-4 py-3 capitalize">{profile.accountType.replaceAll("_", " ")}</td>
                      <td className="break-words px-4 py-3">{profile.organizationName?.trim() || "—"}</td>
                      <td className="break-words px-4 py-3 capitalize">{profile.internalRole?.replaceAll("_", " ") ?? "—"}</td>
                      <td className="px-4 py-3">{profile.emailVerified ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {!filteredProfiles.length ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">
                      {profiles.length ? "No profiles match this search." : "No Bridge profiles were returned by the successful query."}
                    </td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <details className="rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer font-semibold">Recent operator activity</summary>
          <p className="mt-2 text-sm text-muted">Audit events are read from the persisted Bridge audit log.</p>
          <ul className="mt-4 divide-y divide-line">
            {(auditQ.data?.logs ?? []).slice(0, 8).map((log) => (
              <li key={log.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">{log.action}</span>
                <span className="text-xs text-muted">{log.entityType}:{log.entityId}</span>
              </li>
            ))}
            {auditQ.isError ? <li className="py-3 text-sm text-muted">Audit history is temporarily unavailable.</li> : null}
            {!auditQ.isPending && !auditQ.isError && !(auditQ.data?.logs ?? []).length ? <li className="py-3 text-sm text-muted">No audit events found.</li> : null}
          </ul>
        </details>
      </div>
    </BridgeShell>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5"><p className="text-xs uppercase tracking-widest text-muted">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></article>;
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return <article className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"><span className="text-sm text-muted">{label}</span><span className="text-lg font-semibold tabular-nums">{value}</span></article>;
}
