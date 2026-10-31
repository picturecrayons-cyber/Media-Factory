import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles, listAuditLogs, importNamedLegacyDrafts } from "@/lib/bridge/titles";
import { listEnquiries } from "@/lib/bridge/leads";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { ServiceQueue } from "@/components/bridge/service-requests";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { listAdminProfiles } from "@/lib/bridge/profiles";
import { legacyCatalog } from "@/lib/bridge/legacy-catalog";

export const Route = createFileRoute("/admin")({ component: AdminControlPlane });

function AdminControlPlane() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        if (!isAdmin) {
          return (
            <BridgeShell actor={actor} title="Admin">
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">Admin access required</h2>
                <p className="mt-2 max-w-xl text-sm text-muted">This workspace is limited to Bridge administrators. Your operational workspace remains available from the sidebar.</p>
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
  const [legacyQuery, setLegacyQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const qc = useQueryClient();
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const auditQ = useQuery({ queryKey: ["bridge-audit"], queryFn: () => listAuditLogs() });
  const distQ = useQuery({ queryKey: ["loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness() });
  const profilesQ = useQuery({ queryKey: ["bridge-admin-profiles"], queryFn: () => listAdminProfiles() });
  const enquiriesQ = useQuery({ queryKey: ["bridge-enquiries"], queryFn: () => listEnquiries() });

  const titles = titlesQ.data?.titles ?? [];
  const distribution = distQ.data?.titles ?? [];
  const profiles = profilesQ.data?.profiles ?? [];
  const organizations = new Set(profiles.map((profile) => profile.organizationName).filter(Boolean));
  const qcQueue = titles.filter((title) => title.status === "PREPARING" || title.status === "QC_REVIEW").length;
  const rightsQueue = titles.filter((title) => title.status === "RIGHTS_REVIEW").length;
  const buyerReady = titles.filter((title) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED"].includes(title.status)).length;
  const live = distribution.filter((title) => title.publication?.published).length;
  const attention = titles.filter((title) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(title.status)).slice(0, 5);
  const loading = titlesQ.isPending;
  const importDrafts = useMutation({
    mutationFn: () => importNamedLegacyDrafts(),
    onSuccess: async (result) => {
      toast.success(result.added.length ? `Added ${result.added.length} drafts.` : "Those drafts are already in the library.");
      await qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add drafts"),
  });
  const needle = peopleQuery.trim().toLowerCase();
  const people = profiles.filter((profile) => {
    if (!needle) return true;
    return [profile.displayName, profile.email, profile.accountType, profile.organizationName || ""].join(" ").toLowerCase().includes(needle);
  });

  return (
    <BridgeShell actor={actor} title="Admin dashboard">
      <div className="space-y-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Crayons Pictures · Operations</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Good overview. Clear next steps.</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">Review titles, complete QC and rights checks, and authorize delivery only when required gates pass.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/workstations"><Button>Open workspace</Button></Link>
            <Link to="/cms"><Button variant="outline">Open CMS</Button></Link>
            <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer"><Button variant="outline">Open Loop</Button></a>
            <a href="https://www.streamvista.in/" target="_blank" rel="noreferrer"><Button variant="outline">Open StreamVista</Button></a>
          </div>
        </section>

        <section aria-label="Title overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="All titles" value={loading ? "—" : String(titles.length)} detail="Canonical catalog" />
          <Metric label="QC / intake" value={loading ? "—" : String(qcQueue)} detail="Awaiting review" />
          <Metric label="Rights review" value={loading ? "—" : String(rightsQueue)} detail="Clearance queue" />
          <Metric label="Buyer-ready" value={loading ? "—" : String(buyerReady)} detail="Licensing stages" />
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Workspace snapshot</h3>
            <span className="text-xs text-muted">Live records</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetric label="Loop publications" value={distQ.isPending ? "—" : String(live)} />
            <CompactMetric label="Bridge profiles" value={profilesQ.isPending ? "—" : String(profiles.length)} />
            <CompactMetric label="Organizations" value={profilesQ.isPending ? "—" : String(organizations.size)} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h3 className="font-display text-xl font-semibold">New title</h3>
          <p className="mt-1 mb-4 text-sm text-muted">Same record a creator or studio opens. Title, rights, and authorization stay together.</p>
          <CreateTitleForm />
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h3 className="font-display text-xl font-semibold">Desk enquiries</h3>
          <p className="mt-1 text-sm text-muted">Sent from the public desk. Nothing here is a sample.</p>
          {enquiriesQ.isPending ? <p className="mt-3 text-sm text-muted">Loading…</p> : null}
          {enquiriesQ.isError ? <p role="alert" className="mt-3 text-sm text-muted">Could not load enquiries.</p> : null}
          <div className="mt-3 divide-y divide-line">
            {(enquiriesQ.data?.enquiries ?? []).map((row) => (
              <article key={row.id} className="py-3">
                <p className="text-sm font-semibold">{row.name} · {row.email}</p>
                <p className="text-xs text-muted">{row.organization || "No company"} · {new Date(row.created_at).toLocaleString()}</p>
                <p className="mt-1 text-sm">{row.message}</p>
              </article>
            ))}
            {!enquiriesQ.isPending && !enquiriesQ.isError && (enquiriesQ.data?.enquiries.length ?? 0) === 0 ? (
              <p className="py-4 text-sm text-muted">No enquiries yet.</p>
            ) : null}
          </div>
        </section>

        <ServiceQueue />

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold">People</h3>
              <p className="mt-1 text-sm text-muted">Bridge accounts, then the old contacts. Test names are not added as titles.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input id="people-search" name="people" autoComplete="off" value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Name or email" className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm sm:w-56" />
              {actor.internalRole === "super_admin" ? (
                <button type="button" disabled={importDrafts.isPending} onClick={() => importDrafts.mutate()} className="h-10 rounded-full bg-[#102433] px-4 text-sm font-semibold text-white">
                  {importDrafts.isPending ? "Adding…" : "Add named drafts"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 divide-y divide-line">
            {profilesQ.isPending ? <p className="py-3 text-sm text-muted">Loading accounts…</p> : null}
            {people.map((profile) => (
              <article key={profile.userId} className="py-3">
                <p className="text-sm font-semibold">{profile.displayName || "No name"}</p>
                <p className="text-xs text-muted">{profile.email} · {profile.accountType}{profile.internalRole ? ` · ${profile.internalRole}` : ""}{profile.organizationName ? ` · ${profile.organizationName}` : ""}</p>
              </article>
            ))}
          </div>
          <h4 className="mt-5 text-sm font-semibold">Old contacts with no title · {legacyCatalog.empty.reduce((sum, row) => sum + row.count, 0)}</h4>
          <div className="mt-2 divide-y divide-line">
            {legacyCatalog.empty.filter((row) => !needle || [row.owner, row.email, row.phone].join(" ").toLowerCase().includes(needle)).map((row) => (
              <article key={row.email || row.owner} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm">{row.owner || "Owner not named"}</p>
                  <p className="text-xs text-muted">{row.email || "No email"}{row.phone ? ` · ${row.phone}` : ""}</p>
                </div>
                <span className="text-sm tabular-nums">{row.count}</span>
              </article>
            ))}
          </div>
        </section>

        <LegacyCatalog query={legacyQuery} onQuery={setLegacyQuery} />

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold">Needs attention</h3>
              <p className="mt-1 text-sm text-muted">The next five titles in intake, QC, rights, or licensing review.</p>
            </div>
            <Link to="/admin/workstations" className="text-sm font-semibold text-accent hover:underline">View all work →</Link>
          </div>
          <div className="mt-3 divide-y divide-line">
            {attention.map((title) => (
              <div key={title.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{title.name}</p>
                  <span className="mt-1 inline-flex rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                    {title.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>
                <Link to="/title/$id" params={{ id: title.id }} className="shrink-0 text-sm font-semibold text-accent hover:underline">Open title →</Link>
              </div>
            ))}
            {loading ? <p className="py-5 text-sm text-muted">Loading title queue…</p> : null}
            {titlesQ.isError ? <p role="alert" className="py-5 text-sm text-muted">Could not load titles. Refresh to retry.</p> : null}
            {!loading && !titlesQ.isError && attention.length === 0 ? <p className="py-5 text-sm text-muted">Nothing needs attention in these stages.</p> : null}
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <details className="min-w-0 rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer list-none font-semibold">Users & organizations <span className="ml-1 text-sm font-normal text-muted">({profiles.length})</span></summary>
            <p className="mt-2 text-sm text-muted">Read-only Bridge profile view. Role changes remain controlled by the invitation and onboarding flow.</p>
            {profilesQ.isError ? <p role="alert" className="mt-3 text-sm text-muted">Profiles could not be loaded.</p> : null}
            <div className="mt-3 max-h-80 overflow-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="sticky top-0 border-b border-line bg-surface text-xs uppercase tracking-wider text-muted">
                  <tr><th className="px-2 py-2">User</th><th className="px-2 py-2">Account</th><th className="px-2 py-2">Organization</th><th className="px-2 py-2">Role</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {profiles.slice(0, 50).map((profile) => (
                    <tr key={profile.userId}>
                      <td className="px-2 py-3"><p className="font-medium">{profile.displayName}</p><p className="text-xs text-muted">{profile.email}</p></td>
                      <td className="px-2 py-3">{profile.accountType.replaceAll("_", " ")}</td>
                      <td className="px-2 py-3">{profile.organizationName ?? "—"}</td>
                      <td className="px-2 py-3">{profile.internalRole?.replaceAll("_", " ") ?? "—"}</td>
                    </tr>
                  ))}
                  {!profilesQ.isPending && !profilesQ.isError && profiles.length === 0 ? <tr><td colSpan={4} className="px-2 py-6 text-center text-muted">No Bridge profiles found.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Link to="/internal"><Button variant="outline">Invite internal user</Button></Link></div>
          </details>

          <details className="min-w-0 rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer list-none font-semibold">Recent operator activity</summary>
            <p className="mt-2 text-sm text-muted">Latest events from the persisted Bridge audit log.</p>
            {auditQ.isError ? <p role="alert" className="mt-3 text-sm text-muted">Audit history is temporarily unavailable.</p> : null}
            <ul className="mt-3 divide-y divide-line">
              {(auditQ.data?.logs ?? []).slice(0, 8).map((log) => (
                <li key={log.id} className="flex flex-col gap-1 py-3">
                  <span className="break-words text-sm font-medium">{log.action}</span>
                  <span className="break-all text-xs text-muted">{log.entityType}:{log.entityId}</span>
                </li>
              ))}
              {!auditQ.isPending && !auditQ.isError && !(auditQ.data?.logs ?? []).length ? <li className="py-3 text-sm text-muted">No audit events found.</li> : null}
            </ul>
          </details>
        </section>
      </div>
    </BridgeShell>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3 py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function LegacyCatalog({ query, onQuery }: { query: string; onQuery: (value: string) => void }) {
  const needle = query.trim().toLowerCase();
  const titles = legacyCatalog.titles.filter((row) => {
    if (!needle) return true;
    return [row.title, row.owner, row.email, row.phone, row.language].join(" ").toLowerCase().includes(needle);
  });
  const empty = legacyCatalog.empty.filter((row) => {
    if (!needle) return true;
    return [row.owner, row.email, row.phone].join(" ").toLowerCase().includes(needle);
  });
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Old catalog</h3>
          <p className="mt-1 text-sm text-muted">Every old record stays a draft. Nothing here is live, and nothing was written into the title library.</p>
        </div>
        <input
          id="legacy-search"
          name="legacy"
          autoComplete="off"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Title, email, or phone"
          className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm sm:w-64"
        />
      </div>
      <div className="mt-4 divide-y divide-line">
        {titles.map((row) => (
          <article key={`${row.source}-${row.oldId}`} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="text-xs text-muted">{row.type} · {row.language || "Language not set"} · Draft</p>
              <p className="mt-1 text-sm">{row.owner || "Owner not named"}</p>
              <p className="text-xs text-muted">{row.email || "No email"}{row.phone ? ` · ${row.phone}` : ""}</p>
            </div>
            <p className="text-xs text-muted">{row.video ? "Video on the old app" : "No video"} · {row.poster ? "Poster" : "No poster"}</p>
          </article>
        ))}
      </div>
      <h4 className="mt-5 text-sm font-semibold">Empty drafts · {legacyCatalog.empty.reduce((sum, row) => sum + row.count, 0)}</h4>
      <p className="mt-1 text-xs text-muted">No title was saved. The contact is kept so you can write to them later.</p>
      <div className="mt-2 divide-y divide-line">
        {empty.map((row) => (
          <article key={row.email || row.owner} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="text-sm">{row.owner || "Owner not named"}</p>
              <p className="text-xs text-muted">{row.email || "No email"}{row.phone ? ` · ${row.phone}` : ""}</p>
            </div>
            <span className="text-sm tabular-nums">{row.count}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
