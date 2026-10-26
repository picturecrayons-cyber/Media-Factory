import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authorizeLoopPublication, listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { listPublishingPartners, savePublishingPartner } from "@/lib/bridge/partners";

export function PublishingDesk() {
  const qc = useQueryClient();
  const partnersQ = useQuery({ queryKey: ["bridge-partners"], queryFn: () => listPublishingPartners() });
  const loopQ = useQuery({ queryKey: ["loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness() });
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"external" | "in_house">("external");
  const [share, setShare] = useState("33");
  const [contractRef, setContractRef] = useState("");
  const [contact, setContact] = useState("");

  const save = useMutation({
    mutationFn: () => savePublishingPartner({
      data: { name, kind, sharePct: Number(share) || 0, contractRef, contact },
    }),
    onSuccess: async () => {
      setAdding(false);
      setName("");
      setContractRef("");
      setContact("");
      toast.success("Partner saved.");
      await qc.invalidateQueries({ queryKey: ["bridge-partners"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the partner"),
  });

  const partners = partnersQ.data?.partners ?? [];
  const titles = loopQ.data?.titles ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Publishing partners</h2>
          <button type="button" onClick={() => setAdding((open) => !open)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
            {adding ? "Close" : "Add"}
          </button>
        </div>
        {adding ? (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Partner name" className="h-12 rounded-xl border border-line-strong px-3" />
            <select value={kind} onChange={(e) => setKind(e.target.value as "external" | "in_house")} className="h-12 rounded-xl border border-line-strong px-3">
              <option value="external">External</option>
              <option value="in_house">In-house</option>
            </select>
            <input value={share} onChange={(e) => setShare(e.target.value)} inputMode="numeric" placeholder="Share %" className="h-12 rounded-xl border border-line-strong px-3" />
            <input value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="Contract reference" className="h-12 rounded-xl border border-line-strong px-3" />
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact" className="h-12 rounded-xl border border-line-strong px-3 sm:col-span-2" />
            <button type="submit" disabled={save.isPending} className="h-12 rounded-full bg-[#0b1220] text-sm font-semibold text-white sm:col-span-2">
              {save.isPending ? "Saving…" : "Save partner"}
            </button>
          </form>
        ) : null}
        <ul className="mt-3 divide-y divide-line">
          {partners.map((partner) => (
            <li key={partner.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{partner.name}</p>
                <p className="text-xs text-muted">{partner.kind === "in_house" ? "In-house" : "External"} · {partner.sharePct}%{partner.contractRef ? ` · ${partner.contractRef}` : ""}</p>
              </div>
              <span className="text-xs text-muted">{partner.contact}</span>
            </li>
          ))}
          {!partnersQ.isPending && !partners.length ? <li className="py-3 text-sm text-muted">No partners yet.</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4">
        <h2 className="text-lg font-semibold">Loop publication</h2>
        <p className="mt-1 text-sm text-muted">A title reaches Crayons Loop only after this gate is green.</p>
        <ul className="mt-3 divide-y divide-line">
          {titles.map((title) => (
            <li key={title.id} className="py-3">
              <button type="button" onClick={() => setOpenId(openId === title.id ? "" : title.id)} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="min-w-0 truncate text-sm font-semibold">{title.name}</span>
                <span className={`shrink-0 text-xs font-semibold ${title.ready ? "text-emerald-700" : "text-red-700"}`}>{title.ready ? "Green" : "Blocked"}</span>
              </button>
              {openId === title.id ? <LoopGate title={title} partnerShare={partners[0]?.sharePct ?? 0} /> : null}
            </li>
          ))}
          {!loopQ.isPending && !titles.length ? <li className="py-3 text-sm text-muted">No titles.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function LoopGate({
  title,
  partnerShare,
}: {
  title: {
    id: string;
    name: string;
    language: string;
    ready: boolean;
    blockers: string[];
    hasMaster: boolean;
    hasPoster: boolean;
  };
  partnerShare: number;
}) {
  const qc = useQueryClient();
  const [model, setModel] = useState<"TVOD" | "SVOD" | "AVOD">("TVOD");
  const [territory, setTerritory] = useState("IN");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [share, setShare] = useState(String(partnerShare || 33));
  const authorize = useMutation({
    mutationFn: () => authorizeLoopPublication({
      data: {
        bridgeTitleId: title.id,
        destination: "CRAYONS_LOOP",
        territories: [territory],
        languages: [title.language || "Malayalam"],
        exploitationModels: [model],
        accessTier: model,
        windowStart: new Date(start).toISOString(),
        windowEnd: new Date(end).toISOString(),
        commercialTerms: {
          distributorSharePct: Number(share) || 0,
          rightsOwnerSharePct: Math.max(0, 100 - (Number(share) || 0)),
          notes: "No sub-licensing.",
        },
      },
    }),
    onSuccess: async () => {
      toast.success("Authorized for Loop.");
      await qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Authorization blocked"),
  });
  const checks = [
    ["Assets", title.hasPoster && title.hasMaster],
    ["QC and storage", title.hasMaster],
    ["Legal and rights", title.ready || !title.blockers.some((item) => item.toLowerCase().includes("rights"))],
    ["License terms", Boolean(start && end && territory && model)],
  ] as const;
  const green = checks.every(([, ok]) => ok) && title.ready;

  return (
    <div className="mt-3 grid gap-3">
      <ul className="grid gap-1 text-sm">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? "text-emerald-700" : "text-red-700"}>{ok ? "Ready" : "Missing"} · {label}</li>
        ))}
      </ul>
      {title.blockers.length ? <p className="text-sm text-red-700">{title.blockers[0]}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={model} onChange={(e) => setModel(e.target.value as "TVOD" | "SVOD" | "AVOD")} className="h-11 rounded-xl border border-line px-3">
          <option value="TVOD">TVOD</option>
          <option value="SVOD">SVOD</option>
          <option value="AVOD">AVOD</option>
        </select>
        <input value={territory} onChange={(e) => setTerritory(e.target.value.toUpperCase())} placeholder="Territory" className="h-11 rounded-xl border border-line px-3" />
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-11 rounded-xl border border-line px-3" />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11 rounded-xl border border-line px-3" />
        <input value={share} onChange={(e) => setShare(e.target.value)} inputMode="numeric" placeholder="Partner share %" className="h-11 rounded-xl border border-line px-3 sm:col-span-2" />
      </div>
      <button type="button" disabled={!green || authorize.isPending} onClick={() => authorize.mutate()} className="h-11 rounded-full bg-[#0b1220] text-sm font-semibold text-white disabled:opacity-40">
        {authorize.isPending ? "Authorizing…" : "Authorize for Loop"}
      </button>
      <p className="text-xs text-muted">No sub-licensing. The audit log records who authorized this.</p>
    </div>
  );
}
