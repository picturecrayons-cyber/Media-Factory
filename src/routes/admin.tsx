import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles, listAuditLogs } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { listAdminProfiles, updateAdminProfile } from "@/lib/bridge/profiles";

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
  const titles = titlesQ.data?.titles ?? [];
  const distribution = distQ.data?.titles ?? [];
  const profiles = profilesQ.data?.profiles ?? [];
  const organizations = new Set(profiles.map((p) => p.organizationName).filter(Boolean));
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
          <CompactMetric label="Organizations" value={profilesQ.isPending ? "—" : String(organizations.size)} />
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h3 className="font-display text-xl font-semibold">Discovery tools</h3>
          <p className="mt-1 text-sm text-muted">Open the right workspace by task. Audit and review first; no automatic approval, deletion, merge or publication.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link to="/workspace" className="rounded-xl border border-line p-4 hover:bg-elevated/50"><p className="font-semibold">Title library</p><p className="mt-1 text-xs text-muted">Search titles, inspect canonical IDs and open full records.</p></Link>
            <Link to="/admin/workstations" className="rounded-xl border border-line p-4 hover:bg-elevated/50"><p className="font-semibold">Curation / QC / Rights</p><p className="mt-1 text-xs text-muted">Review submissions, evidence, assets and audit trail.</p></Link>
            <Link to="/deliveries" className="rounded-xl border border-line p-4 hover:bg-elevated/50"><p className="font-semibold">Packaging & vendor jobs</p><p className="mt-1 text-xs text-muted">Inspect delivery status and request specialist work.</p></Link>
            <Link to="/account" className="rounded-xl border border-line p-4 hover:bg-elevated/50"><p className="font-semibold">Organization profile</p><p className="mt-1 text-xs text-muted">Review Super Admin organization details.</p></Link>
          </div>
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

        <details className="rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer font-semibold">Users & organizations <span className="ml-2 text-sm font-normal text-muted">({profiles.length})</span></summary>
          <p className="mt-2 text-sm text-muted">Edit profile details here. Internal roles remain invitation-controlled; account deletion is intentionally not exposed because it must be coordinated with the identity provider and audit history.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Account</th><th className="px-3 py-3">Organization</th><th className="px-3 py-3">Internal role</th><th className="px-3 py-3">Verified</th><th className="px-3 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {profiles.slice(0, 50).map((profile) => (
                  <AdminProfileRow key={profile.userId} profile={profile} />
                ))}
                {!profiles.length ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">No Bridge profiles found.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4"><Link to="/internal"><Button variant="outline">Invite internal user</Button></Link></div>
        </details>

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

type AdminProfile = {
  userId: string;
  email: string;
  displayName: string;
  accountType: string;
  organizationName: string | null;
  internalRole: string | null;
  emailVerified: boolean;
};

function AdminProfileRow({ profile }: { profile: AdminProfile }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [organizationName, setOrganizationName] = useState(profile.organizationName ?? "");
  const mutation = useMutation({
    mutationFn: () => updateAdminProfile({
      data: {
        userId: profile.userId,
        displayName: displayName.trim(),
        organizationName: organizationName.trim() || null,
      },
    }),
    onSuccess: async () => {
      toast("User profile updated");
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ["bridge-admin-profiles"] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not update user"),
  });
  return (
    <>
      <tr>
        <td className="px-3 py-3"><p className="font-medium">{profile.displayName}</p><p className="text-xs text-muted">{profile.email}</p></td>
        <td className="px-3 py-3">{profile.accountType.replaceAll("_", " ")}</td>
        <td className="px-3 py-3">{profile.organizationName ?? "—"}</td>
        <td className="px-3 py-3">{profile.internalRole?.replaceAll("_", " ") ?? "—"}</td>
        <td className="px-3 py-3">{profile.emailVerified ? "Yes" : "No"}</td>
        <td className="px-3 py-3"><Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => { setDisplayName(profile.displayName); setOrganizationName(profile.organizationName ?? ""); setEditing((value) => !value); }}>{editing ? "Cancel" : "Edit"}</Button></td>
      </tr>
      {editing ? (
        <tr>
          <td colSpan={6} className="bg-elevated/30 px-3 py-3">
            <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
              <label className="text-xs text-muted">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} className="mt-1 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg" /></label>
              <label className="text-xs text-muted">Organization<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} maxLength={120} className="mt-1 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg" /></label>
              <div className="flex items-end"><Button type="submit" className="h-9 px-3 text-xs" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save changes"}</Button></div>
            </form>
            {mutation.isError ? <p role="alert" className="mt-2 text-xs text-muted">{mutation.error instanceof Error ? mutation.error.message : "Update failed"}</p> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5"><p className="text-xs uppercase tracking-widest text-muted">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></article>;
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return <article className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"><span className="text-sm text-muted">{label}</span><span className="text-lg font-semibold tabular-nums">{value}</span></article>;
}
