import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import type { BridgeActor } from "@/lib/bridge/session";
import { listFounderControlCentre } from "@/lib/bridge/admin-workstations";

export const Route = createFileRoute("/admin/founder-control-centre")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: FounderControlCentre,
});

const TABS = ["Prepare", "Business", "Distribution", "Revenue"] as const;
type Tab = (typeof TABS)[number];

function FounderControlCentre() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        if (actor.internalRole !== "super_admin") {
          return (
            <BridgeShell actor={actor} title="Founder Control Centre">
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">Super Admin access required</h2>
                <p className="mt-2 text-sm text-muted">This internal control centre is restricted to verified Super Admin accounts.</p>
              </section>
            </BridgeShell>
          );
        }
        return <FounderBody actor={actor} />;
      }}
    </RequireBridge>
  );
}

function FounderBody({ actor }: { actor: BridgeActor }) {
  const [tab, setTab] = useState<Tab>("Prepare");
  const query = useQuery({
    queryKey: ["founder-control-centre"],
    queryFn: () => listFounderControlCentre(),
    staleTime: 30_000,
  });
  const data = query.data;
  const titles = data?.titles ?? [];
  const titleNames = new Map(titles.map((title: any) => [title.id, title.name]));
  const assets = data?.assets ?? [];
  const packages = data?.packages ?? [];
  const publications = data?.publications ?? [];
  const rights = data?.rights ?? [];
  const legal = data?.legal ?? [];
  const qc = data?.qc ?? [];

  return (
    <BridgeShell actor={actor} title="Founder Control Centre">
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Super Admin</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold">One control centre for every title</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">Prepare → Business → Distribution → Revenue. Existing title, rights, QC, finance and publication safeguards remain authoritative.</p>
            </div>
            <Link to="/admin/workstations" className="text-sm font-semibold text-accent hover:underline">Open full operational records →</Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Summary label="Titles" value={query.isPending ? "—" : String(titles.length)} />
            <Summary label="Assets" value={query.isPending ? "—" : String(assets.length)} />
            <Summary label="Rights records" value={query.isPending ? "—" : String(rights.length)} />
            <Summary label="Loop records" value={query.isPending ? "—" : String(publications.length)} />
          </div>
        </section>

        <nav aria-label="Title operations" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TABS.map((item) => (
            <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)}
              className={"rounded-xl border px-4 py-3 text-sm font-semibold " + (tab === item ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted hover:text-fg")}>
              {item}
            </button>
          ))}
        </nav>

        {query.isPending ? <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">Loading canonical Bridge records…</p> : null}
        {query.isError ? <div role="alert" className="rounded-xl border border-line bg-surface p-5 text-sm">Founder data is unavailable. No zero values are substituted. Refresh and retry.</div> : null}

        {!query.isPending && !query.isError && tab === "Prepare" ? (
          <div className="space-y-4">
            <Panel title="Titles & preparation" description="Canonical title records, metadata and current preparation state.">
              <RecordList rows={titles} empty="No titles found." />
            </Panel>
            <Panel title="Asset Inspection Desk" description="Read-only asset inventory. Open a title to use its existing authorized preview and download controls. Storage keys are not displayed in this screen.">
              {assets.length ? <div className="divide-y divide-line">{assets.map((asset: any) => (
                <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{String(titleNames.get(asset.title_id) ?? "Title") } · {String(asset.kind ?? "Asset").replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-muted">{asset.content_type ?? "MIME not recorded"} · {formatBytes(asset.byte_size)} · {asset.created_at ? new Date(asset.created_at).toLocaleString() : "Upload time unavailable"}</p>
                  </div>
                  <Link to="/title/$id" params={{ id: asset.title_id }} className="text-sm font-semibold text-accent hover:underline">Inspect title assets →</Link>
                </div>
              ))}</div> : <Empty>No asset records found.</Empty>}
              <p className="mt-3 text-xs text-muted">This desk does not mutate OCI objects, upload records, checksums or title metadata. Preview availability depends on the existing asset authorization service.</p>
            </Panel>
            <Panel title="QC status" description="Recorded QC cases only. A status label is not independent media-integrity certification.">
              <SimpleRows rows={qc} fields={["title_id", "status", "reviewed_by", "reviewed_at"]} names={titleNames} />
            </Panel>
          </div>
        ) : null}

        {!query.isPending && !query.isError && tab === "Business" ? (
          <div className="space-y-4">
            <Panel title="Rights & Legal" description="Evidence and review status. Approval remains subject to verified evidence, permissions and the existing legal review rules.">
              <SimpleRows rows={legal} fields={["title_id", "status", "classification", "reviewed_by", "reviewed_at"]} names={titleNames} />
              <SimpleRows rows={rights} fields={["title_id", "grant_type", "territories", "languages", "exclusivity", "status", "window_start", "window_end"]} names={titleNames} />
            </Panel>
            <Panel title="People & Roles" description="Read-only profile and organization administration entry points. Role changes continue through existing controlled onboarding and invitation flows.">
              <Link to="/internal" className="text-sm font-semibold text-accent hover:underline">Open internal people & role controls →</Link>
              <Link to="/admin" className="ml-4 text-sm font-semibold text-accent hover:underline">Admin overview →</Link>
            </Panel>
          </div>
        ) : null}

        {!query.isPending && !query.isError && tab === "Distribution" ? (
          <div className="space-y-4">
            <Panel title="Licensing & Buyers" description="Destination package and buyer release records. Readiness labels do not create buyer entitlements.">
              <SimpleRows rows={packages} fields={["title_id", "destination", "readiness_state", "commercial_model", "authorized_at"]} names={titleNames} />
              <Link to="/admin/workstations" className="text-sm font-semibold text-accent hover:underline">Open licensing and buyer operations →</Link>
            </Panel>
            <Panel title="Loop Gateway" description="Bridge publication authorization and Loop publication status are separate controls.">
              <SimpleRows rows={publications} fields={["bridge_title_id", "authorization_status", "territories", "languages", "window_start", "window_end", "approved_at", "revoked_at"]} names={titleNames} />
              <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent hover:underline">Open Crayons Loop ↗</a>
            </Panel>
          </div>
        ) : null}

        {!query.isPending && !query.isError && tab === "Revenue" ? (
          <div className="space-y-4">
            <Panel title="Revenue & statements" description="This screen does not infer bank settlement from payment status or licensing value. Existing finance records remain in their current authorized workspace.">
              <p className="text-sm text-muted">No bank-settlement or royalty certification is produced by this summary.</p>
              <Link to="/admin/workstations" className="text-sm font-semibold text-accent hover:underline">Open finance and delivery records →</Link>
            </Panel>
            <Panel title="Commercial packages" description="Persisted package records; not a statement of cash received.">
              <SimpleRows rows={packages} fields={["title_id", "destination", "commercial_model", "revenue_share_percent", "readiness_state"]} names={titleNames} />
            </Panel>
          </div>
        ) : null}
      </div>
    </BridgeShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-bg p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>;
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-surface p-5"><h3 className="font-display text-lg font-semibold">{title}</h3><p className="mt-1 mb-4 text-sm text-muted">{description}</p>{children}</section>;
}

function RecordList({ rows, empty }: { rows: any[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <div className="divide-y divide-line">{rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{row.name}</p><p className="mt-1 text-xs text-muted">{row.status} · {row.language ?? "Language not recorded"}</p></div><Link to="/title/$id" params={{ id: row.id }} className="text-sm font-semibold text-accent hover:underline">Open title →</Link></div>)}</div>;
}

function SimpleRows({ rows, fields, names }: { rows: any[]; fields: string[]; names: Map<any, any> }) {
  if (!rows.length) return <Empty>No persisted records found.</Empty>;
  return <div className="space-y-2">{rows.slice(0, 100).map((row, index) => <article key={row.id ?? index} className="rounded-xl border border-line p-3"><p className="mb-2 text-xs font-semibold text-muted">{names.get(row.title_id ?? row.bridge_title_id) ?? "Title record"}</p><dl className="grid gap-2 sm:grid-cols-2">{fields.filter((field) => field !== "title_id" && row[field] != null).map((field) => <div key={field}><dt className="text-[11px] uppercase tracking-wide text-muted">{field.replaceAll("_", " ")}</dt><dd className="break-words text-sm">{Array.isArray(row[field]) ? row[field].join(", ") : String(row[field])}</dd></div>)}</dl></article>)}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-line p-4 text-sm text-muted">{children}</p>;
}

function formatBytes(value: unknown) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Size not recorded";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes / 1024;
  let unit = units[0];
  for (let i = 1; amount >= 1024 && i < units.length - 1; i++) { amount /= 1024; unit = units[i]; }
  return amount.toFixed(1) + " " + unit;
}
