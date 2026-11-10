import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { createBuyerCrm, inviteBuyerCrmContact, listBuyerCrm, updateBuyerCrmStatus } from "@/lib/bridge/buyer-crm";

export const Route = createFileRoute("/buyer-crm")({ component: BuyerCrm });

type Buyer = {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  channel_type: string;
  pipeline_status: string;
  notes: string | null;
  title_count: number;
};

const statuses = ["target", "contacted", "qualified", "invited", "active", "negotiating", "won", "lost", "paused"] as const;

function BuyerCrm() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer CRM">
          <BuyerCrmBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerCrmBody() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [channelType, setChannelType] = useState("buyer");
  const buyersQ = useQuery({ queryKey: ["bridge-buyer-crm"], queryFn: () => listBuyerCrm(), retry: false });
  const create = useMutation({
    mutationFn: () => createBuyerCrm({ data: {
      companyName: companyName.trim(),
      ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
      ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
      channelType: channelType as "buyer" | "channel_partner" | "distributor" | "aggregator" | "other",
    } }),
    onSuccess: () => {
      setCompanyName(""); setContactName(""); setContactEmail("");
      void qc.invalidateQueries({ queryKey: ["bridge-buyer-crm"] });
      toast.success("Buyer added to CRM");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add buyer"),
  });
  const status = useMutation({
    mutationFn: (v: { id: string; status: typeof statuses[number] }) => updateBuyerCrmStatus({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bridge-buyer-crm"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });
  const invite = useMutation({
    mutationFn: (b: Buyer) => {
      if (!b.contact_email) throw new Error("Add a contact email before sending an invitation.");
      return inviteBuyerCrmContact({ data: {
        crmId: b.id,
        email: b.contact_email,
        idempotencyKey: `buyer-invite-${b.id}-${b.contact_email.toLowerCase()}`,
      } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bridge-buyer-crm"] });
      toast.success("Invitation workflow completed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Invitation failed"),
  });
  const buyers = (buyersQ.data?.buyers ?? []) as Buyer[];
  const needle = query.trim().toLowerCase();
  const visible = buyers.filter((b) => `${b.company_name} ${b.contact_name ?? ""} ${b.contact_email ?? ""} ${b.channel_type} ${b.pipeline_status}`.toLowerCase().includes(needle));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Studio workspace</p>
        <h2 className="font-display text-3xl font-semibold">Buyer CRM & invite pipeline</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">Track target buyers and channel partners, assign pipeline status, and send contact invitations. CRM records are scoped to your verified organization.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="All contacts" value={String(buyers.length)} />
        <Metric label="Invited" value={String(buyers.filter((b) => b.pipeline_status === "invited").length)} />
        <Metric label="Qualified / active" value={String(buyers.filter((b) => ["qualified", "active", "negotiating"].includes(b.pipeline_status)).length)} />
      </section>
      <form className="grid gap-3 rounded-sm border border-line p-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <h3 className="font-semibold md:col-span-2">Add target buyer</h3>
        <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company / channel partner" maxLength={180} className="rounded-sm border border-line bg-transparent px-3 py-2 text-sm" />
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name (optional)" maxLength={160} className="rounded-sm border border-line bg-transparent px-3 py-2 text-sm" />
        <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Contact email (optional)" maxLength={320} className="rounded-sm border border-line bg-transparent px-3 py-2 text-sm" />
        <select value={channelType} onChange={(e) => setChannelType(e.target.value)} className="rounded-sm border border-line bg-transparent px-3 py-2 text-sm">
          <option value="buyer">Buyer</option><option value="channel_partner">Channel partner</option><option value="distributor">Distributor</option><option value="aggregator">Aggregator</option><option value="other">Other</option>
        </select>
        <div className="md:col-span-2"><Button type="submit" disabled={create.isPending || !companyName.trim()}>{create.isPending ? "Adding…" : "Add to CRM"}</Button></div>
      </form>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Pipeline</h3>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, contact, status…" className="w-full max-w-sm rounded-sm border border-line bg-transparent px-3 py-2 text-sm" />
        </div>
        {buyersQ.isPending ? <p className="text-sm text-muted">Loading organization CRM…</p> : null}
        {buyersQ.isError ? <p role="alert" className="text-sm text-accent">CRM could not be loaded. Verify Studio organization membership and that migration 0022 has been reviewed and applied in a permitted non-production environment.</p> : null}
        {!buyersQ.isPending && !buyersQ.isError && visible.length === 0 ? <p className="rounded-sm border border-line p-5 text-sm text-muted">No matching CRM contacts yet.</p> : null}
        <ul className="divide-y divide-line rounded-sm border border-line">
          {visible.map((b) => (
            <li key={b.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{b.company_name}</p>
                  <p className="text-sm text-muted">{b.contact_name || "Contact not set"}{b.contact_email ? ` · ${b.contact_email}` : ""}{b.contact_phone ? ` · ${b.contact_phone}` : ""}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted">{b.channel_type.replaceAll("_", " ")} · {b.title_count} assigned titles</p>
                </div>
                <span className="rounded-sm border border-line px-2 py-1 text-xs capitalize">{b.pipeline_status.replaceAll("_", " ")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <select aria-label={`Status for ${b.company_name}`} value={b.pipeline_status} onChange={(e) => status.mutate({ id: b.id, status: e.target.value as typeof statuses[number] })} disabled={status.isPending} className="rounded-sm border border-line bg-transparent px-2 py-1.5 text-sm">
                  {statuses.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
                </select>
                <Button variant="outline" disabled={invite.isPending || !b.contact_email} onClick={() => invite.mutate(b)}>{invite.isPending ? "Sending…" : "Invite to Bridge"}</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted">Security note: CRM invitations do not grant internal roles or title rights. Invitation acceptance and any buyer-account linking require separate verified authorization.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-sm border border-line px-4 py-3"><div className="text-xs uppercase tracking-widest text-muted">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}
