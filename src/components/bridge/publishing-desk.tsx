import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authorizeLoopPublication, listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { listOutletActivity, listPublishingPartners, recordOutletDeal, savePublishingPartner, updatePublishingPartner } from "@/lib/bridge/partners";

export function PublishingDesk() {
  const qc = useQueryClient();
  const [distributionOpen, setDistributionOpen] = useState(false);
  const partnersQ = useQuery({ queryKey: ["bridge-partners"], queryFn: () => listPublishingPartners() });
  const loopQ = useQuery({ queryKey: ["loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness(), enabled: distributionOpen });
  const activityQ = useQuery({ queryKey: ["outlet-activity"], queryFn: () => listOutletActivity(), enabled: distributionOpen });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
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
  const edit = useMutation({
    mutationFn: (input: { id: string; sharePct: number; contact: string; contractRef: string }) => updatePublishingPartner({ data: input }),
    onSuccess: async () => {
      setEditId("");
      toast.success("Partner updated.");
      await qc.invalidateQueries({ queryKey: ["bridge-partners"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update the partner"),
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
            <li key={partner.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{partner.name}</p>
                  <p className="text-xs text-muted">{partner.kind === "in_house" ? "In-house" : "External"} · {partner.sharePct}%{partner.contractRef ? ` · ${partner.contractRef}` : ""}</p>
                </div>
                <button type="button" onClick={() => setEditId(editId === partner.id ? "" : partner.id)} className="text-sm font-semibold">{editId === partner.id ? "Close" : "Edit"}</button>
              </div>
              {editId === partner.id ? (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    edit.mutate({
                      id: partner.id,
                      sharePct: Number(form.get("share")) || 0,
                      contractRef: String(form.get("contract") || ""),
                      contact: String(form.get("contact") || ""),
                    });
                  }}
                >
                  <input name="share" defaultValue={partner.sharePct} className="h-11 rounded-xl border border-line px-3" />
                  <input name="contract" defaultValue={partner.contractRef} placeholder="Contract" className="h-11 rounded-xl border border-line px-3" />
                  <input name="contact" defaultValue={partner.contact} placeholder="Contact" className="h-11 rounded-xl border border-line px-3" />
                  <button type="submit" className="h-11 rounded-full bg-[#0b1220] text-sm font-semibold text-white sm:col-span-3">Save</button>
                </form>
              ) : null}
            </li>
          ))}
          {!partnersQ.isPending && !partners.length ? <li className="py-3 text-sm text-muted">No partners yet.</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Distribution</h2>
          <button type="button" onClick={() => setDistributionOpen((open) => !open)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">{distributionOpen ? "Close" : "Open"}</button>
        </div>
        <p className="mt-1 text-sm text-muted">Loop is one outlet. A buyer or another platform can be authorized on its own contract.</p>
        {distributionOpen ? (
        <>
        <ul className="mt-3 divide-y divide-line">
          {titles.map((title) => (
            <li key={title.id} className="py-3">
              <button type="button" onClick={() => setOpenId(openId === title.id ? "" : title.id)} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="min-w-0 truncate text-sm font-semibold">{title.name}</span>
                <span className="shrink-0 text-xs font-semibold text-muted">{title.ready ? "Loop ready" : title.bridgeStatus.replaceAll("_", " ").toLowerCase()}</span>
              </button>
              {openId === title.id ? <LoopGate title={title} partnerShare={partners[0]?.sharePct ?? 0} /> : null}
            </li>
          ))}
          {!loopQ.isPending && !titles.length ? <li className="py-3 text-sm text-muted">No titles.</li> : null}
        </ul>
        {(activityQ.data?.deals.length || activityQ.data?.screeners.length) ? (
          <div className="mt-4 grid gap-2 text-sm">
            {activityQ.data?.deals.map((deal) => (
              <p key={deal.id}>{deal.outlet} · {deal.model} · {deal.territory}</p>
            ))}
            {activityQ.data?.screeners.map((item) => (
              <p key={item.id}>Screener requested · {item.days} days · {item.status}</p>
            ))}
          </div>
        ) : null}
        </>
        ) : null}
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
  const [outlet, setOutlet] = useState<"loop" | "buyer" | "platform">("buyer");
  const [model, setModel] = useState<"TVOD" | "SVOD" | "AVOD">("TVOD");
  const [territory, setTerritory] = useState("IN");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [share, setShare] = useState(String(partnerShare || 33));
  const authorize = useMutation({
    mutationFn: () => outlet === "loop"
      ? authorizeLoopPublication({
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
        })
      : recordOutletDeal({
          data: {
            titleId: title.id,
            outlet,
            model,
            territory,
            windowStart: start,
            windowEnd: end,
            sharePct: Number(share) || 0,
          },
        }),
    onSuccess: async () => {
      toast.success(outlet === "loop" ? "Authorized for Loop." : "Deal recorded.");
      await qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] });
      await qc.invalidateQueries({ queryKey: ["outlet-activity"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Authorization blocked"),
  });
  const checks = [
    ["Assets", title.hasPoster && title.hasMaster],
    ["QC and storage", title.hasMaster],
    ["Legal and rights", title.ready || !title.blockers.some((item) => item.toLowerCase().includes("rights"))],
    ["License terms", Boolean(start && end && territory && model)],
  ] as const;
  const green = outlet === "loop" ? title.ready && checks[3][1] : checks[3][1];

  return (
    <div className="mt-3 grid gap-3">
      <ul className="grid gap-1 text-sm">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? "text-emerald-700" : "text-muted"}>{ok ? "In place" : "Open"} · {label}</li>
        ))}
      </ul>
      {outlet === "loop" && title.blockers.length ? <p className="text-sm text-muted">{title.blockers[0]}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={outlet} onChange={(e) => setOutlet(e.target.value as "loop" | "buyer" | "platform")} className="h-11 rounded-xl border border-line px-3 sm:col-span-2">
          <option value="buyer">Direct buyer</option>
          <option value="platform">External platform</option>
          <option value="loop">Crayons Loop</option>
        </select>
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
        {authorize.isPending ? "Authorizing…" : outlet === "loop" ? "Authorize for Loop" : "Record the deal"}
      </button>
      <p className="text-xs text-muted">No sub-licensing. The audit log records who authorized this.</p>
    </div>
  );
}
