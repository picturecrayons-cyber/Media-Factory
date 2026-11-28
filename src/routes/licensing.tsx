import { useMemo, useState, type ReactNode } from "react";
import type { BridgeActor } from "@/lib/bridge/session";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";

const MARKET_STATUSES = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"] as const;

export const Route = createFileRoute("/licensing")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: LicensingDesk,
});

type DeskTab = "market" | "buyers" | "television";

function LicensingDesk() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
          return (
            <BridgeShell actor={actor} title="Licensing Desk">
              <section className="rounded-xl border border-line bg-surface p-6">
                <h2 className="font-semibold">Licensing administration required</h2>
                <p className="mt-2 text-sm text-muted">This desk is restricted to verified Bridge administrators. Your authorized workspace remains available from the navigation.</p>
              </section>
            </BridgeShell>
          );
        }
        return <LicensingDeskBody actor={actor} />;
      }}
    </RequireBridge>
  );
}

function LicensingDeskBody({ actor }: { actor: BridgeActor }) {
  const [tab, setTab] = useState<DeskTab>("market");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const titlesQ = useQuery({
    queryKey: ["bridge-licensing-desk-titles"],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const market = useMemo(() => titles.filter((title) => MARKET_STATUSES.includes(title.status as (typeof MARKET_STATUSES)[number])), [titles]);
  const filtered = useMemo(() => market.filter((title) => {
    const matchesQuery = !query.trim() || `${title.name} ${title.language}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === "all" || title.status === status;
    return matchesQuery && matchesStatus;
  }), [market, query, status]);

  return (
    <BridgeShell actor={actor} title="Licensing Desk">
      <div className="space-y-5">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Bridge · Rights to market</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Licensing control desk</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">A separate workspace for licensing candidates, buyer activity and future broadcast partners. This desk does not create rights, commercial terms or publication authorization.</p>
          </div>
          <Link to="/admin/workstations"><Button variant="outline">Operations & approvals</Button></Link>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Licensing candidates" value={titlesQ.isPending ? "…" : titlesQ.isError ? "Unavailable" : String(market.length)} note="Recorded title states only" />
          <Metric label="Fee not recorded" value={titlesQ.isPending ? "…" : titlesQ.isError ? "Unavailable" : String(market.filter((title) => !title.licensingFeePaise).length)} note="No fee is inferred" />
          <Metric label="Buyer desk" value="Separate" note="Buyer accounts and catalogue" />
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Licensing workspaces">
          <TabButton active={tab === "market"} onClick={() => setTab("market")}>Market-ready titles</TabButton>
          <TabButton active={tab === "buyers"} onClick={() => setTab("buyers")}>External Buyers</TabButton>
          <TabButton active={tab === "television"} onClick={() => setTab("television")}>Television & Broadcast</TabButton>
        </div>

        {tab === "market" ? (
          <section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
            <div>
              <h3 className="font-display text-xl font-semibold">Market-ready title queue</h3>
              <p className="mt-1 text-sm text-muted">Candidate status is not the same as buyer visibility. Open each title to review rights evidence, approval, territory, language, validity window and publication gates.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input aria-label="Search title" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or language" className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm sm:max-w-md" />
              <select aria-label="Filter licensing status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-line bg-bg px-3 py-2 text-sm">
                <option value="all">All licensing stages</option>
                {MARKET_STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            {titlesQ.isPending ? <p role="status" className="py-8 text-sm text-muted">Loading title records…</p> : null}
            {titlesQ.isError ? <section role="alert" className="rounded-md border border-line p-4"><p className="font-medium">Title records could not be loaded.</p><button className="mt-2 text-sm underline" onClick={() => void titlesQ.refetch()}>Retry</button></section> : null}
            {!titlesQ.isPending && !titlesQ.isError && filtered.length === 0 ? <p className="rounded-md border border-dashed border-line p-8 text-center text-sm text-muted">No titles in this licensing stage match the search.</p> : null}
            {filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                    <tr><th className="px-3 py-3">Title</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Language</th><th className="px-3 py-3">Recorded fee</th><th className="px-3 py-3">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((title) => (
                      <tr key={title.id}>
                        <td className="px-3 py-3 font-medium">{title.name}</td>
                        <td className="px-3 py-3"><span className="rounded-full border border-line px-2 py-1 text-xs">{title.status.replaceAll("_", " ")}</span></td>
                        <td className="px-3 py-3">{title.language || "—"}</td>
                        <td className="px-3 py-3 tabular-nums">{title.licensingFeePaise > 0 ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(title.licensingFeePaise / 100) : "Unset"}</td>
                        <td className="px-3 py-3"><Link to="/title/$id" params={{ id: title.id }} className="font-semibold text-accent hover:underline">Open title →</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="text-xs text-muted">No licensing fee or deal term is generated by this desk. Missing values remain Unset until entered and approved in the title workflow.</p>
          </section>
        ) : null}

        {tab === "buyers" ? (
          <section className="rounded-xl border border-line bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">External Buyer Desk</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">Buyer accounts, eligible catalogue visibility, captured-payment licensing and buyer entitlements remain in the separate Buyer workspace. A title appears there only when server-side publication and rights gates allow it.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/buyer"><Button>Open Buyer view</Button></Link>
              <Link to="/internal"><Button variant="outline">People & access</Button></Link>
            </div>
          </section>
        ) : null}

        {tab === "television" ? (
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-display text-xl font-semibold">Television & Broadcast Partners</h3><p className="mt-1 text-sm text-muted">Separate partner workflow — not yet activated.</p></div>
              <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">PLANNED · NOT ACTIVE</span>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-muted">Broadcast partner records, channel-specific offers, territory and language windows, exclusivity, holdbacks, agreement evidence and delivery specifications require a dedicated contract-backed workflow. No partner, contract, fee or availability is fabricated here.</p>
            <p className="mt-3 text-xs text-muted">This tab is a separate module boundary only; it does not yet create or manage television deals or deliveries.</p>
          </section>
        ) : null}
      </div>
    </BridgeShell>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`rounded-md border px-3 py-2 text-sm ${active ? "border-accent text-accent" : "border-line text-muted"}`}>{children}</button>;
}
