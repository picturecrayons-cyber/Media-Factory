import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createProductionShootSubmission } from "@/lib/bridge/production-shoot-submission";

const inputClass = "mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3";
const labelClass = "text-sm";

export function ProductionShootForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [productionNo, setProductionNo] = useState("");
  const [productionTitle, setProductionTitle] = useState("");
  const [productionFormat, setProductionFormat] = useState("FEATURE");
  const [developmentStage, setDevelopmentStage] = useState("PRE_PRODUCTION");
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [shootDays, setShootDays] = useState("");
  const [primaryLocation, setPrimaryLocation] = useState("");
  const [producerName, setProducerName] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [productionNotes, setProductionNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => createProductionShootSubmission({ data: {
      productionNo, productionTitle,
      productionFormat: productionFormat as "FEATURE" | "SERIES" | "SHORT" | "DOCUMENTARY" | "ADVERTISEMENT" | "OTHER",
      developmentStage: developmentStage as "DEVELOPMENT" | "PRE_PRODUCTION" | "PRINCIPAL_PHOTOGRAPHY" | "POST_PRODUCTION" | "ON_HOLD" | "COMPLETED",
      plannedStartDate: plannedStartDate || undefined,
      plannedEndDate: plannedEndDate || undefined,
      shootDays: shootDays ? Number(shootDays) : undefined,
      primaryLocation: primaryLocation || undefined,
      producerName: producerName || undefined,
      directorName: directorName || undefined,
      productionNotes: productionNotes || undefined,
    }}),
    onSuccess: (result) => {
      toast("Production Shoot submitted to Bridge intake");
      void queryClient.invalidateQueries({ queryKey: ["bridge-titles"] });
      void navigate({ to: "/title/$id", params: { id: result.titleId } });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not submit production"),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate) {
      toast("Planned end date must not be before start date");
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h3 className="font-semibold">Production Shoot details</h3>
        <p className="mt-1 text-xs text-muted">A separate production record with its own Production No. and Production Title. This is not a finished-film catalogue or QC submission.</p>
      </div>
      <label className={labelClass}>Production No.<input required maxLength={80} value={productionNo} onChange={e => setProductionNo(e.target.value)} className={inputClass} placeholder="e.g. CP-2026-001" /></label>
      <label className={labelClass}>Production Title<input required maxLength={200} value={productionTitle} onChange={e => setProductionTitle(e.target.value)} className={inputClass} placeholder="Working production title" /></label>
      <label className={labelClass}>Production format<select value={productionFormat} onChange={e => setProductionFormat(e.target.value)} className={inputClass}>{["FEATURE","SERIES","SHORT","DOCUMENTARY","ADVERTISEMENT","OTHER"].map(v => <option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
      <label className={labelClass}>Production stage<select value={developmentStage} onChange={e => setDevelopmentStage(e.target.value)} className={inputClass}>{["DEVELOPMENT","PRE_PRODUCTION","PRINCIPAL_PHOTOGRAPHY","POST_PRODUCTION","ON_HOLD","COMPLETED"].map(v => <option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
      <label className={labelClass}>Planned shoot start<input type="date" value={plannedStartDate} onChange={e => setPlannedStartDate(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Planned shoot end<input type="date" value={plannedEndDate} onChange={e => setPlannedEndDate(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Estimated shoot days<input type="number" min={1} max={1000} value={shootDays} onChange={e => setShootDays(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Primary location<input maxLength={240} value={primaryLocation} onChange={e => setPrimaryLocation(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Producer<input maxLength={160} value={producerName} onChange={e => setProducerName(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Director<input maxLength={160} value={directorName} onChange={e => setDirectorName(e.target.value)} className={inputClass} /></label>
      <label className={`${labelClass} sm:col-span-2`}>Production notes<textarea rows={4} maxLength={4000} value={productionNotes} onChange={e => setProductionNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
      <div className="rounded-lg border border-line bg-elevated p-3 text-xs leading-relaxed text-muted sm:col-span-2">
        Submission status will be recorded separately from the title workflow. QC, rights, legal review, media verification and delivery are not approved by this submission.
      </div>
      <div className="sm:col-span-2"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Submitting…" : "Submit Production Shoot to Bridge"}</Button></div>
    </form>
  );
}
