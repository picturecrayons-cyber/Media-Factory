import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { loopStageType } from "@/lib/bridge/loop-lanes";
import type { TitleStatus } from "@/lib/bridge/types";

export const Route = createFileRoute("/admin/analytics")({ component: RevenueAnalytics });

const STATUS_OPTIONS: Array<{ value: "ALL" | TitleStatus; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "UPLOADING", label: "Uploading" },
  { value: "PREPARING", label: "Preparing" },
  { value: "QC_REVIEW", label: "QC review" },
  { value: "RIGHTS_REVIEW", label: "Rights review" },
  { value: "LICENSING_READY", label: "Ready to list" },
  { value: "LIVE_FOR_BUYERS", label: "Live for buyers" },
  { value: "IN_NEGOTIATION", label: "In negotiation" },
  { value: "LICENSED", label: "Licensed" },
  { value: "DELIVERED", label: "Delivered" },
];

function formatMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function RevenueAnalytics() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Revenue & analytics">
          <RevenueAnalyticsBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function RevenueAnalyticsBody() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | TitleStatus>("ALL");
  const [lane, setLane] = useState("ALL");
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", "revenue-analytics"],
    queryFn: () => listTitles(),
    retry: 1,
  });

  const titles = titlesQ.data?.titles ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return titles.filter((title) => {
      const matchesSearch = !q || title.name.toLocaleLowerCase().includes(q) || title.id.toLocaleLowerCase().includes(q);
      const matchesStatus = status === "ALL" || title.status === status;
      const matchesLane = lane === "ALL" || loopStageType(title.contentType) === ({ FILM: "Film", SERIES: "Series", VERTICAL: "Vertical drama", SHORT: "Short" } as const)[lane as "FILM" | "SERIES" | "VERTICAL" | "SHORT"];
      return matchesSearch && matchesStatus && matchesLane;
    });
  }, [titles, search, status, lane]);

  const needsAction = titles.filter((title) => ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(title.status)).length;
  const licensedValue = titles.reduce((sum, title) =>
    sum + (["LICENSED", "DELIVERED"].includes(title.status) ? title.licensingFeePaise : 0), 0);
  const isUnavailable = titlesQ.isError;
  const isLoading = titlesQ.isPending;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge → Loop · Admin only</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Title revenue & performance</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              One place to review canonical title status and known licensing value. Loop sales, playback analytics and settlement totals are shown as unavailable until a verified, title-linked reporting source is connected.
            </p>
          </div>
          <Link to="/dashboard" className="text-sm font-semibold text-accent hover:underline">← Revenue desk</Link>
        </div>
      </section>

      {isUnavailable ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-semibold">Reporting unavailable</h3>
          <p className="mt-1 text-sm text-muted">Canonical title data could not be loaded. Metrics are withheld instead of being shown as zero.</p>
          <button type="button" onClick={() => void titlesQ.refetch()} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold">Retry</button>
        </section>
      ) : null}

      <section aria-label="Current reporting metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Canonical titles" value={isLoading || isUnavailable ? "—" : String(titles.length)} note="Current title records returned" />
        <Metric label="Titles needing a decision" value={isLoading || isUnavailable ? "—" : String(needsAction)} note="QC, rights or listing readiness" />
        <Metric label="Recorded licensed value" value={isLoading || isUnavailable ? "—" : formatMoney(licensedValue)} note="Title fee for Licensed/Delivered records; not cash received" />
        <Metric label="Loop watch time & TVOD sales" value="NOT AVAILABLE" note="Verified title-linked analytics are not connected" />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold">Title performance ledger</h3>
            <p className="mt-1 text-sm text-muted">Search and filter title records. Media verification, rights clearance and buyer authorization remain separate gates.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Search title or ID</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Workflow status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | TitleStatus)} className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3">
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Content lane</span>
              <select value={lane} onChange={(event) => setLane(event.target.value)} className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3">
                <option value="ALL">All lanes</option>
                <option value="FILM">Films</option>
                <option value="SERIES">Series</option>
                <option value="VERTICAL">Vertical drama</option>
                <option value="SHORT">Shorts</option>
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-sm text-muted">Loading canonical title records…</p>
        ) : isUnavailable ? null : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-3 py-3 font-medium">Title</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="px-3 py-3 font-medium">Runtime</th>
                  <th scope="col" className="px-3 py-3 font-medium">Licensing fee</th>
                  <th scope="col" className="px-3 py-3 font-medium">TVOD sales</th>
                  <th scope="col" className="px-3 py-3 font-medium">Watch time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((title) => (
                  <tr key={title.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-3">
                      <span className="font-medium">{title.name}</span>
                      <span className="mt-1 block font-mono text-[10px] text-muted">{title.id}</span>
                    </td>
                    <td className="px-3 py-3"><span className="rounded-full border border-line px-2 py-1 text-xs">{title.status.replaceAll("_", " ")}</span></td>
                    <td className="px-3 py-3">{title.runtimeMinutes ? `${title.runtimeMinutes} min` : "NOT AVAILABLE"}</td>
                    <td className="px-3 py-3">{title.licensingFeePaise > 0 ? formatMoney(title.licensingFeePaise) : "NOT SET"}</td>
                    <td className="px-3 py-3 text-muted">NOT AVAILABLE</td>
                    <td className="px-3 py-3 text-muted">NOT AVAILABLE</td>
                  </tr>
                ))}
                {filtered.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">No titles match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          No playback minutes, user counts, payment totals, refunds or settlements are inferred from runtime or title fees. Those values require instrumented events and verified title-to-order reconciliation.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <InfoCard title="QC & rights" description="Continue curation and approval in the existing role-gated operations workspace." href="/admin/workstations" action="Open approvals" />
        <InfoCard title="Orders & licensing" description="Review existing buyer and licensing workflows. This page does not alter payments or entitlements." href="/buyer" action="Open buyer desk" />
        <InfoCard title="Title metadata" description="Add or update title metadata now; ingest trailers and main films when ready." href="/workspace" action="Open title library" />
      </section>
      <p className="text-xs text-muted">Read-only analytics view · Asia/Kolkata reporting target · Production release certification unchanged.</p>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-xl border border-line bg-surface px-4 py-4"><p className="text-xs uppercase tracking-widest text-muted">{label}</p><p className="mt-2 break-words text-2xl font-semibold">{value}</p><p className="mt-1 text-xs leading-relaxed text-muted">{note}</p></article>;
}

function InfoCard({ title, description, href, action }: { title: string; description: string; href: "/admin/workstations" | "/buyer" | "/workspace"; action: string }) {
  return <article className="flex flex-col items-start rounded-xl border border-line bg-surface p-4"><h3 className="font-semibold">{title}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{description}</p><Link to={href} className="mt-4 text-sm font-semibold text-accent hover:underline">{action} →</Link></article>;
}
