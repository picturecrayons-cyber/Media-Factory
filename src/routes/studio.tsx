import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { getStudioOverview, listStudioRights } from "@/lib/bridge/studio";
import { createStudioDeal, listStudioDeals } from "@/lib/bridge/deals";
import { formatInrPaise } from "@/lib/bridge/studio-metrics";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/studio")({ component: Studio });

const TABS = [
  "overview",
  "slate",
  "rights",
  "licensing",
  "deals",
  "revenue",
  "deliveries",
  "team",
  "account",
] as const;
type Tab = (typeof TABS)[number];

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} kicker="Studio" title={actor.organizationName ?? "Studio dashboard"}>
          <StudioBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StudioBody() {
  const [tab, setTab] = useState<Tab>("overview");
  const [addOpen, setAddOpen] = useState(false);
  const overviewQ = useQuery({ queryKey: ["studio-overview"], queryFn: () => getStudioOverview() });
  const data = overviewQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Same title record as independent creators. Studio RBAC wraps the slate. Consumer playback stays on
          CRAYONS LOOP.
        </p>
        <div className="flex gap-2">
          <Button type="button" onClick={() => { setTab("slate"); setAddOpen(true); }}>
            + Add Title
          </Button>
          <Button type="button" variant="outline" onClick={() => setTab("slate")}>
            View slate
          </Button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line pb-2 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("rounded-sm px-3 py-1.5 capitalize", tab === t ? "bg-surface text-fg" : "text-muted hover:text-fg")}
          >
            {t === "account" ? "settings" : t}
          </button>
        ))}
      </nav>

      {overviewQ.isPending ? <p className="text-sm text-muted">Loading studio…</p> : null}
      {overviewQ.isError ? (
        <p className="text-sm text-accent">{overviewQ.error instanceof Error ? overviewQ.error.message : "Studio unavailable"}</p>
      ) : null}

      {data && tab === "overview" ? <Overview data={data} onAdd={() => { setTab("slate"); setAddOpen(true); }} /> : null}
      {tab === "slate" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
          {addOpen || !data?.titleCount ? (
            <div>
              <h2 className="mb-3 font-display text-xl">Add title</h2>
              <CreateTitleForm compact />
            </div>
          ) : (
            <p className="text-sm text-muted">Use + Add Title to open a draft on the canonical lifecycle.</p>
          )}
          <div>
            <h2 className="mb-3 font-display text-xl">My slate</h2>
            <SlateTable titles={data?.titles ?? []} />
          </div>
        </div>
      ) : null}
      {tab === "rights" ? <RightsPanel /> : null}
      {tab === "licensing" ? <LicensingPanel loop={data?.loop ?? false} /> : null}
      {tab === "deals" ? <DealRoom titles={data?.titles ?? []} /> : null}
      {tab === "revenue" ? <RevenuePanel data={data} /> : null}
      {tab === "deliveries" ? (
        <EmptyLine text="No approved delivery packages yet. Delivery is authorized after captured payment — never from a toggle." />
      ) : null}
      {tab === "team" ? (
        <EmptyLine text="No additional studio members yet. Invite flow stays on the internal desk." />
      ) : null}
      {tab === "account" ? (
        <p className="text-sm text-muted">
          Company profile, payout, and mailbox live on{" "}
          <Link to="/account" className="text-accent underline-offset-4 hover:underline">
            Account
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function Overview({
  data,
  onAdd,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getStudioOverview>>>;
  onAdd: () => void;
}) {
  if (!data.titleCount) {
    return (
      <div className="rounded-sm border border-line bg-surface p-6">
        <p className="font-display text-2xl">Your Studio is ready. Add your first title.</p>
        <p className="mt-2 text-sm text-muted">No titles have been added to this studio slate yet.</p>
        <Button type="button" className="mt-4" onClick={onAdd}>
          + Add Title
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Titles" value={String(data.titleCount)} />
        <Stat label="In review" value={String(data.inReview)} />
        <Stat label="Licensed" value={String(data.licensed)} />
        <Stat
          label="Captured receipts"
          value={data.capturedLabel ?? "No transactions yet"}
          muted={!data.capturedLabel}
        />
      </ul>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Title pipeline</p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {data.pipeline.map((col) => (
            <li key={col.id} className="rounded-sm border border-line bg-surface px-3 py-3">
              <p className="text-xs text-muted">{col.label}</p>
              <p className="font-display text-2xl tabular-nums">{col.count}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Flag ok={data.razorpay} label="Razorpay" yes="configured" no="not configured" />
        <Flag ok={data.mail} label="Hostinger mail" yes="Preview SMTP bound" no="SMTP_PASS unset" />
        <Flag ok={data.loop} label="LOOP ingest" yes="handoff bound" no="not configured" />
      </div>
      <SlateTable titles={data.titles} />
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <li className="rounded-sm border border-line bg-surface px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-2xl tabular-nums", muted && "text-muted text-lg")}>{value}</p>
    </li>
  );
}

function Flag({ ok, label, yes, no }: { ok: boolean; label: string; yes: string; no: string }) {
  return (
    <p className="rounded-sm border border-line px-3 py-2">
      <span className="text-muted">{label}: </span>
      {ok ? yes : no}
    </p>
  );
}

function SlateTable({
  titles,
}: {
  titles: {
    id: string;
    name: string;
    nameMl: string | null;
    year: number | null;
    status: string;
    licensingFeePaise: number;
    updatedAt: string;
  }[];
}) {
  if (!titles.length) {
    return <p className="text-sm text-muted">No titles have been added to this studio slate yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs uppercase tracking-[0.12em] text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Malayalam</th>
            <th className="px-3 py-2 font-medium">Year</th>
            <th className="px-3 py-2 font-medium">Fee</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {titles.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2">{t.name}</td>
              <td className="px-3 py-2 text-muted">{t.nameMl || "—"}</td>
              <td className="px-3 py-2 tabular-nums">{t.year ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{formatInrPaise(t.licensingFeePaise) ?? "—"}</td>
              <td className="px-3 py-2">
                <StatusChip status={t.status as never} />
              </td>
              <td className="px-3 py-2 text-right">
                <Link to="/title/$id" params={{ id: t.id }} className="text-accent underline-offset-4 hover:underline">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RightsPanel() {
  const q = useQuery({ queryKey: ["studio-rights"], queryFn: () => listStudioRights() });
  const rows = q.data?.rows ?? [];
  if (q.isPending) return <p className="text-sm text-muted">Loading rights…</p>;
  if (!rows.length) return <EmptyLine text="No rights have been configured for this slate." />;
  const configured = rows.filter((r) => r.rightsType);
  if (!configured.length) return <EmptyLine text="No rights have been configured for this title." />;
  return (
    <div className="overflow-x-auto rounded-sm border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs uppercase tracking-[0.12em] text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Territory</th>
            <th className="px-3 py-2 font-medium">Platform</th>
            <th className="px-3 py-2 font-medium">Window</th>
            <th className="px-3 py-2 font-medium">Chain</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.titleId}>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{r.rightsType || "—"}</td>
              <td className="px-3 py-2">{r.territories || "—"}</td>
              <td className="px-3 py-2">{r.mediaType || "—"}</td>
              <td className="px-3 py-2 text-muted">
                {r.startDate || r.endDate ? `${r.startDate ?? "—"} → ${r.endDate ?? "—"}` : "—"}
              </td>
              <td className="px-3 py-2">{r.approvedAt ? r.chainOfTitleStatus : "not verified"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LicensingPanel({ loop }: { loop: boolean }) {
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-2">
      <li className="rounded-sm border border-line px-3 py-2">
        Crayons LOOP / SVOD–TVOD — {loop ? "ingest bound, awaiting publication" : "not configured"}
      </li>
      <li className="rounded-sm border border-line px-3 py-2">FAST — not configured</li>
      <li className="rounded-sm border border-line px-3 py-2">AVOD — not configured</li>
      <li className="rounded-sm border border-line px-3 py-2">Airline / IFE — not configured</li>
      <li className="rounded-sm border border-line px-3 py-2">Broadcast / Regional TV — not configured</li>
      <li className="rounded-sm border border-line px-3 py-2">International OTT — not configured</li>
    </ul>
  );
}

function DealRoom({ titles }: { titles: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const dealsQ = useQuery({ queryKey: ["studio-deals"], queryFn: () => listStudioDeals() });
  const [titleId, setTitleId] = useState(titles[0]?.id ?? "");
  const [licensee, setLicensee] = useState("");
  const [rightType, setRightType] = useState("OTT");
  const [territory, setTerritory] = useState("IN");
  const [platform, setPlatform] = useState("CRAYONS_LOOP");
  const mut = useMutation({
    mutationFn: () =>
      createStudioDeal({
        data: { titleId, licensee, rightType, territory, platform },
      }),
    onSuccess: () => {
      toast("Opportunity recorded");
      setLicensee("");
      void qc.invalidateQueries({ queryKey: ["studio-deals"] });
      void qc.invalidateQueries({ queryKey: ["studio-overview"] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Deal not saved"),
  });
  const deals = dealsQ.data?.deals ?? [];
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
      <form onSubmit={onSubmit} className="grid gap-2 rounded-sm border border-line bg-surface p-3 text-sm">
        <p className="font-medium">New opportunity</p>
        <label>
          Title
          <select
            required
            value={titleId}
            onChange={(e) => setTitleId(e.target.value)}
            className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2"
          >
            <option value="">Select</option>
            {titles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Licensee
          <input
            required
            value={licensee}
            onChange={(e) => setLicensee(e.target.value)}
            className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Right
            <input
              value={rightType}
              onChange={(e) => setRightType(e.target.value)}
              className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2"
            />
          </label>
          <label>
            Territory
            <input
              value={territory}
              onChange={(e) => setTerritory(e.target.value)}
              className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2"
            />
          </label>
        </div>
        <label>
          Platform
          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2"
          />
        </label>
        <Button type="submit" disabled={mut.isPending || !titles.length}>
          {mut.isPending ? "Saving…" : "Record opportunity"}
        </Button>
        {!titles.length ? <p className="text-xs text-muted">Add a title before a deal.</p> : null}
      </form>
      <div>
        {dealsQ.data && "schemaPending" in dealsQ.data && dealsQ.data.schemaPending ? (
          <EmptyLine text="Deal Room schema is not applied yet (migration 0008). No records." />
        ) : null}
        {!deals.length ? (
          <EmptyLine text="No licensing opportunities yet." />
        ) : (
          <ul className="divide-y divide-line rounded-sm border border-line text-sm">
            {deals.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {d.titleName} · {d.licensee} · {d.territory}
                </span>
                <span className="text-muted">{d.status.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RevenuePanel({ data }: { data: Awaited<ReturnType<typeof getStudioOverview>> | undefined }) {
  if (!data) return null;
  if (!data.razorpay) {
    return <EmptyLine text="Razorpay not configured. No captured transactions." />;
  }
  if (!data.capturedCount) {
    return (
      <EmptyLine
        text={
          data.razorpayWebhook
            ? "Gateway configured. No captured transactions yet."
            : "Gateway configured — webhook E2E verification pending. No captured transactions yet."
        }
      />
    );
  }
  return (
    <p className="text-sm">
      Captured receipts: <strong>{data.capturedLabel}</strong> ({data.capturedCount} payment
      {data.capturedCount === 1 ? "" : "s"}). Studio share is not computed until a settlement record exists.
    </p>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-sm border border-line bg-surface px-3 py-4 text-sm text-muted">{text}</p>;
}
