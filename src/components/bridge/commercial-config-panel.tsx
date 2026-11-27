import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { configureServiceRate, configureTaxRate } from "@/lib/bridge/commercial-admin";
import { getCommercialConfiguration } from "@/lib/bridge/commercial-config";

function rupees(paise: number) {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BridgeCommercialConfigPanel() {
  const queryClient = useQueryClient();
  const configQ = useQuery({
    queryKey: ["bridge-commercial-configuration"],
    queryFn: () => getCommercialConfiguration(),
    retry: 1,
  });
  const [serviceCode, setServiceCode] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [margin, setMargin] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [activateRate, setActivateRate] = useState(false);
  const [taxRate, setTaxRate] = useState("");
  const [activateTax, setActivateTax] = useState(false);

  const rateMutation = useMutation({
    mutationFn: () => configureServiceRate({
      data: {
        serviceCode,
        basePricePaise: Math.round(Number(basePrice) * 100),
        minimumPricePaise: minimumPrice === "" ? undefined : Math.round(Number(minimumPrice) * 100),
        costBasisPaise: costBasis === "" ? undefined : Math.round(Number(costBasis) * 100),
        targetMarginPercent: margin === "" ? undefined : Number(margin),
        sourceNote,
        activate: activateRate,
      },
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-commercial-configuration"] });
      await queryClient.invalidateQueries({ queryKey: ["bridge-customer-service-catalog"] });
      setBasePrice(""); setMinimumPrice(""); setCostBasis(""); setMargin(""); setSourceNote(""); setActivateRate(false);
    },
  });

  const taxMutation = useMutation({
    mutationFn: () => configureTaxRate({ data: { ratePercent: Number(taxRate), activate: activateTax } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-commercial-configuration"] });
      await queryClient.invalidateQueries({ queryKey: ["bridge-customer-service-catalog"] });
      setTaxRate(""); setActivateTax(false);
    },
  });

  if (configQ.isPending) return <p className="text-sm text-muted">Loading commercial configuration…</p>;
  if (configQ.isError) return <p role="alert" className="text-sm text-accent">Commercial configuration is unavailable. Confirm Super Admin finance permission and retry.</p>;

  function submitRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    rateMutation.mutate();
  }
  function submitTax(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    taxMutation.mutate();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Super Admin · Finance configuration</p>
        <h3 className="mt-1 font-display text-xl font-semibold">Service rates & tax</h3>
        <p className="mt-1 text-sm text-muted">Configuration is inactive by default. Activate only after confirming the approved commercial schedule and applicable tax treatment. Every saved change is audited.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <p className="text-xs text-muted">Active service rates</p>
          <p className="mt-1 text-2xl font-semibold">{configQ.data.rates.length}</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="text-xs text-muted">Active INR tax rate</p>
          <p className="mt-1 text-2xl font-semibold">{configQ.data.taxRate ? configQ.data.taxRate.ratePercent + "%" : "Not configured"}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr><th className="px-3 py-2">Service</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Base price</th><th className="px-3 py-2">Minimum</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {configQ.data.rates.map((rate) => (
              <tr key={rate.id}>
                <td className="px-3 py-2">{configQ.data.services.find((service) => service.code === rate.serviceCode)?.name ?? rate.serviceCode}</td>
                <td className="px-3 py-2">{rate.version}</td>
                <td className="px-3 py-2 tabular-nums">{rupees(rate.basePricePaise)}</td>
                <td className="px-3 py-2 tabular-nums">{rupees(rate.minimumPricePaise)}</td>
              </tr>
            ))}
            {!configQ.data.rates.length ? <tr><td colSpan={4} className="px-3 py-5 text-center text-muted">No active service rates configured.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <form onSubmit={submitRate} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
        <h4 className="font-semibold sm:col-span-2">Add service rate version</h4>
        <label className="grid gap-1 text-sm">Service
          <select required value={serviceCode} onChange={(event) => setServiceCode(event.target.value)} className="min-h-10 rounded-md border border-line bg-bg px-3">
            <option value="">Select a service</option>
            {configQ.data.services.map((service) => <option key={service.code} value={service.code}>{service.name} · {service.code}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Base price (₹)
          <input required type="number" min="0" step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} className="min-h-10 rounded-md border border-line bg-bg px-3" />
        </label>
        <label className="grid gap-1 text-sm">Minimum price (₹)
          <input type="number" min="0" step="0.01" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} className="min-h-10 rounded-md border border-line bg-bg px-3" />
        </label>
        <label className="grid gap-1 text-sm">Cost basis (₹)
          <input type="number" min="0" step="0.01" value={costBasis} onChange={(event) => setCostBasis(event.target.value)} className="min-h-10 rounded-md border border-line bg-bg px-3" />
        </label>
        <label className="grid gap-1 text-sm">Target margin (%)
          <input type="number" min="0" max="100" step="0.01" value={margin} onChange={(event) => setMargin(event.target.value)} className="min-h-10 rounded-md border border-line bg-bg px-3" />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">Source / approval note
          <input maxLength={500} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} className="min-h-10 rounded-md border border-line bg-bg px-3" placeholder="Reference to approved commercial schedule" />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={activateRate} onChange={(event) => setActivateRate(event.target.checked)} />
          Activate this version now (replaces the currently active rate for this service)
        </label>
        {rateMutation.isError ? <p role="alert" className="text-sm text-accent sm:col-span-2">{rateMutation.error instanceof Error ? rateMutation.error.message : "Could not save service rate."}</p> : null}
        {rateMutation.isSuccess ? <p className="text-sm text-muted sm:col-span-2">Rate version saved. Active status: {rateMutation.data.active ? "active" : "inactive"}.</p> : null}
        <button disabled={rateMutation.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50 sm:col-span-2">{rateMutation.isPending ? "Saving…" : "Save service rate version"}</button>
      </form>

      <form onSubmit={submitTax} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
        <h4 className="font-semibold sm:col-span-2">Add INR tax rate version</h4>
        <label className="grid gap-1 text-sm">Tax rate (%)
          <input required type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className="min-h-10 rounded-md border border-line bg-bg px-3" />
        </label>
        <label className="flex items-center gap-2 text-sm self-end">
          <input type="checkbox" checked={activateTax} onChange={(event) => setActivateTax(event.target.checked)} />
          Activate this tax version now
        </label>
        {taxMutation.isError ? <p role="alert" className="text-sm text-accent sm:col-span-2">{taxMutation.error instanceof Error ? taxMutation.error.message : "Could not save tax rate."}</p> : null}
        {taxMutation.isSuccess ? <p className="text-sm text-muted sm:col-span-2">Tax rate version saved. Active status: {taxMutation.data.active ? "active" : "inactive"}.</p> : null}
        <button disabled={taxMutation.isPending} className="rounded-md border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50 sm:col-span-2">{taxMutation.isPending ? "Saving…" : "Save tax rate version"}</button>
      </form>
    </div>
  );
}
