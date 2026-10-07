import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminWorkstations, reviewAdminTitle, setBuyerPublicationGate } from "@/lib/bridge/admin-workstations";

export const Route = createFileRoute("/admin/workstations")({ component: AdminWorkstations });

const TABS = ["Titles", "QC", "Rights", "Assets", "Buyers", "Deliveries", "Audit"] as const;
type Tab = (typeof TABS)[number];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", UPLOADING: "Uploading", PREPARING: "Preparing", QC_REVIEW: "QC Review",
  RIGHTS_REVIEW: "Rights Review", LICENSING_READY: "Licensing Ready", LIVE_FOR_BUYERS: "Live for Buyers",
  IN_NEGOTIATION: "In Negotiation", LICENSED: "Licensed", DELIVERED: "Delivered",
};

function AdminWorkstations() {
  return (
    <RequireBridge allow="internal">
      {(actor) => <BridgeShell actor={actor} title="Admin"><WorkstationBody /></BridgeShell>}
    </RequireBridge>
  );
}

function WorkstationBody() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin-workstations"], queryFn: () => listAdminWorkstations() });
  const review = useMutation({
    mutationFn: reviewAdminTitle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const gate = useMutation({
    mutationFn: setBuyerPublicationGate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
  });
  const [activeTab, setActiveTab] = useState<Tab>("Titles");

  const data = query.data;
  if (query.isLoading) return <div className="p-8 text-sm text-muted">Loading Admin…</div>;
  if (query.isError || !data) return <div className="rounded-2xl border border-line bg-surface p-8 text-sm">Unable to load the Bridge operational backend.</div>;

  const titleName = new Map(data.titles.map((t: any) => [t.id, t.name]));
  const qcQueue = data.titles.filter((t: any) => t.status === "QC_REVIEW");
  const rightsQueue = data.titles.filter((t: any) => t.status === "RIGHTS_REVIEW");
  const ready = data.titles.filter((t: any) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge Admin</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold">Control titles. Clear gates. Release safely.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Internal controls only. Buyer visibility stays fail-closed until the canonical title clears its required gates.</p>
          </div>
          <Link to="/admin" className="text-sm text-accent hover:underline">← Admin overview</Link>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={"whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition " + (activeTab === tab ? "bg-fg text-bg" : "border border-line bg-surface text-muted hover:text-fg")}>
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Titles" ? (
        <TitleQueue titles={data.titles} review={review} />
      ) : activeTab === "QC" ? (
        <ReviewQueue title="QC Review" description="Review technical quality before rights review." titles={qcQueue}
          actions={[["PASS", "Approve → Rights"], ["FAIL", "Fail QC"]]} mutation={review} />
      ) : activeTab === "Rights" ? (
        <ReviewQueue title="Rights Review" description="Clear ownership, territory, language and window before licensing." titles={rightsQueue}
          actions={[["APPROVE", "Approve → Licensing"], ["REJECT", "Reject"]]} mutation={review} />
      ) : activeTab === "Assets" ? (
        <SimpleTable title="Assets" description={data.assets.length + " base assets · " + data.assetVersions.length + " versioned assets"}
          rows={data.assets} fields={["kind", "s3_key", "content_type", "byte_size"]} />
      ) : activeTab === "Buyers" ? (
        <BuyerRelease titles={data.titles} qc={data.qc} legal={data.legal} gate={gate}
          onGate={(titleId, gateName) => gate.mutate({ data: { titleId, gate: gateName, decision: "PASS" } })} />
      ) : activeTab === "Deliveries" ? (
        <div className="space-y-6">
          <SimpleTable title="Licensing & Delivery" description={ready.length + " titles in the commercial pipeline"}
            rows={ready} fields={["name", "status", "language", "licensing_fee_paise", "updated_at"]} />
          <SimpleTable title="Destination Packages" description={data.packages.length + " persisted packages"}
            rows={data.packages} fields={["destination", "package_version", "readiness_state", "commercial_model", "authorized_at"]} />
          <SimpleTable title="Bridge Publications" description={data.publications.length + " persisted authorization records"}
            rows={data.publications} titleName={titleName} fields={["bridge_title_id", "authorization_status", "territories", "languages", "window_end"]} />
        </div>
      ) : (
        <SimpleTable title="Audit History" description="Persisted operator activity. No UI-only decisions."
          rows={data.audit} fields={["action", "entity_type", "entity_id", "actor_user_id", "created_at"]} />
      )}

      {review.isError || gate.isError ? <p className="rounded-xl border border-line p-4 text-sm">Action failed: {String(review.error ?? gate.error)}</p> : null}
    </div>
  );
}

function TitleQueue({ titles, review }: { titles: any[]; review: any }) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Titles" description="One canonical Title ID from intake through delivery." />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {titles.length ? titles.slice(0, 100).map((title) => (
          <div key={title.id} className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{title.name}</p>
              <p className="mt-1 text-xs text-muted">{STATUS_LABELS[title.status] ?? title.status} · {title.language}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {title.status === "PREPARING" ? <ActionButton label="Accept → QC" onClick={() => review.mutate({ data: { titleId: title.id, decision: "ACCEPT" } })} disabled={review.isPending} /> : null}
              <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">Open</Link>
            </div>
          </div>
        )) : <Empty text="No titles in the Bridge catalog." />}
      </div>
    </section>
  );
}

function ReviewQueue({ title, description, titles, actions, mutation }: { title: string; description: string; titles: any[]; actions: Array<[string, string]>; mutation: any }) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} description={description} />
      {titles.length ? titles.map((t) => (
        <div key={t.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{t.name}</p>
            <p className="mt-1 text-xs text-muted">{t.language} · updated {new Date(t.updated_at).toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map(([decision, label]) => <ActionButton key={decision} label={label} disabled={mutation.isPending}
              secondary={decision === "FAIL" || decision === "REJECT"} onClick={() => mutation.mutate({ data: { titleId: t.id, decision } })} />)}
            <Link to="/title/$id" params={{ id: t.id }} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:text-fg">Open</Link>
          </div>
        </div>
      )) : <Empty text={title + " is clear."} />}
    </section>
  );
}

function BuyerRelease({ titles, qc, legal, gate, onGate }: { titles: any[]; qc: any[]; legal: any[]; gate: any; onGate: (titleId: string, gateName: "OTT" | "PACKAGING" | "CURATION" | "DELIVERY") => void }) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Buyer Release" description="Certification controls stay inside Admin. Buyer catalog remains clean and fail-closed." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["OTT preparation", "OTT packaging", "Buyer curation", "Delivery readiness"].map((label) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-medium">{label}</p><p className="mt-1 text-xs text-muted">Admin certification gate</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {titles.map((t) => {
          const qcPassed = qc.some((q) => q.title_id === t.id && q.status === "PASSED");
          const rightsApproved = legal.some((l) => l.title_id === t.id && l.status === "APPROVED");
          return (
            <div key={t.id} className="border-b border-line p-4 last:border-b-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-1 text-xs text-muted">QC {qcPassed ? "cleared" : "hold"} · Rights {rightsApproved ? "cleared" : "hold"} · {STATUS_LABELS[t.status] ?? t.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["OTT", "PACKAGING", "CURATION", "DELIVERY"] as const).map((gateName) =>
                    <ActionButton key={gateName} label={gateName + " pass"} disabled={gate.isPending} secondary onClick={() => onGate(t.id, gateName)} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!titles.length ? <Empty text="No titles available for buyer release review." /> : null}
      </div>
    </section>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div><h3 className="font-display text-2xl font-semibold">{title}</h3><p className="mt-1 text-sm text-muted">{description}</p></div>;
}

function ActionButton({ label, onClick, disabled, secondary = false }: { label: string; onClick: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Button size="sm" variant={secondary ? "outline" : undefined} disabled={disabled} onClick={onClick}>{label}</Button>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-line p-7 text-sm text-muted">{text}</div>;
}

function SimpleTable({ title, description, rows, fields, titleName = new Map<any, any>() }: { title: string; description: string; rows: any[]; fields: string[]; titleName?: Map<any, any> }) {
  if (!rows.length) return <section className="space-y-3"><SectionHeader title={title} description={description} /><Empty text="No persisted records." /></section>;
  return (
    <section className="space-y-3">
      <SectionHeader title={title} description={description} />
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>{fields.map((f) => <th key={f} className="px-3 py-3">{f.replaceAll("_", " ")}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, 50).map((row, i) => (
              <tr key={String(row.id ?? row.user_id ?? i)}>
                {fields.map((f) => <td key={f} className="max-w-[320px] truncate px-3 py-3">
                  {f === "bridge_title_id" ? (titleName.get(row[f]) ?? row[f]) : typeof row[f] === "object" ? JSON.stringify(row[f]) : String(row[f] ?? "—")}
                </td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
