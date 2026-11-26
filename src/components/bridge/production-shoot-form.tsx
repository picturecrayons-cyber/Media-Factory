import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getProductionWorkspace, submitProductionUpdate } from "@/lib/bridge/production-shoot-submission";

export function ProductionShootForm({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const [update, setUpdate] = useState("");
  const [shootProgress, setShootProgress] = useState("NOT_STARTED");
  const [mediaHandoverStatus, setMediaHandoverStatus] = useState("NOT_STARTED");
  const [developmentStage, setDevelopmentStage] = useState("PRE_PRODUCTION");
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [shootDays, setShootDays] = useState("");
  const [primaryLocation, setPrimaryLocation] = useState("");
  const query = useQuery({
    queryKey: ["bridge-production-workspace", titleId],
    queryFn: () => getProductionWorkspace({ data: { titleId } }),
  });
  const mutation = useMutation({
    mutationFn: () => submitProductionUpdate({
      data: {
        titleId,
        update,
        shootProgress: shootProgress as "NOT_STARTED" | "IN_PROGRESS" | "WRAPPED" | "ON_HOLD",
        mediaHandoverStatus: mediaHandoverStatus as "NOT_STARTED" | "IN_PROGRESS" | "PARTIAL" | "COMPLETE" | "QC_PENDING",
        ...(query.data?.studioEditor ? {
          developmentStage: developmentStage as "DEVELOPMENT" | "PRE_PRODUCTION" | "PRINCIPAL_PHOTOGRAPHY" | "POST_PRODUCTION" | "ON_HOLD" | "COMPLETED",
          plannedStartDate: plannedStartDate || null,
          plannedEndDate: plannedEndDate || null,
          shootDays: shootDays ? Number(shootDays) : null,
          primaryLocation: primaryLocation || null,
        } : {}),
      },
    }),
    onSuccess: async () => {
      toast("Production update recorded");
      setUpdate("");
      await qc.invalidateQueries({ queryKey: ["bridge-production-workspace", titleId] });
      await qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: error => toast(error instanceof Error ? error.message : "Production update failed"),
  });

  if (query.isPending) return <p className="mt-4 text-sm text-muted">Checking production activation…</p>;
  if (query.isError) return <p role="alert" className="mt-4 text-sm text-red-600">Production workspace unavailable: {query.error.message}</p>;
  if (!query.data?.production) {
    return (
      <section className="mt-5 rounded-xl border border-dashed border-line p-4">
        <h3 className="font-semibold">Production updates</h3>
        <p className="mt-1 text-sm text-muted">No activated Production workspace is linked to this title. Updates remain locked until Super Admin verifies formal project confirmation and activates the internal workspace. Buyer or investor interest alone is not sufficient.</p>
      </section>
    );
  }
  const production = query.data.production;
  return (
    <section className="mt-5 rounded-xl border border-line bg-elevated/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Production updates</h3>
          <p className="mt-1 text-xs text-muted">{production.production_no} · {production.production_title}</p>
        </div>
        <span className="rounded-full border border-line px-2 py-1 text-xs">{production.development_stage.replaceAll("_", " ")}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Shoot progress
          <select value={shootProgress} onChange={e => setShootProgress(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2">
            {["NOT_STARTED","IN_PROGRESS","WRAPPED","ON_HOLD"].map(v => <option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
          </select>
        </label>
        <label className="text-sm">Media handover
          <select value={mediaHandoverStatus} onChange={e => setMediaHandoverStatus(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2">
            {["NOT_STARTED","IN_PROGRESS","PARTIAL","COMPLETE","QC_PENDING"].map(v => <option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
          </select>
        </label>
        {query.data.studioEditor ? <>
          <label className="text-sm">Production stage
            <select value={developmentStage} onChange={e => setDevelopmentStage(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2">
              {["DEVELOPMENT","PRE_PRODUCTION","PRINCIPAL_PHOTOGRAPHY","POST_PRODUCTION","ON_HOLD","COMPLETED"].map(v => <option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
            </select>
          </label>
          <label className="text-sm">Shoot days
            <input type="number" min="1" max="1000" value={shootDays} onChange={e => setShootDays(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2" />
          </label>
          <label className="text-sm">Planned start
            <input type="date" value={plannedStartDate} onChange={e => setPlannedStartDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2" />
          </label>
          <label className="text-sm">Planned end
            <input type="date" value={plannedEndDate} onChange={e => setPlannedEndDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2" />
          </label>
          <label className="text-sm sm:col-span-2">Primary location
            <input maxLength={240} value={primaryLocation} onChange={e => setPrimaryLocation(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2" />
          </label>
        </> : null}
        <label className="text-sm sm:col-span-2">Update / supporting note
          <textarea required minLength={5} maxLength={2000} rows={3} value={update} onChange={e => setUpdate(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface p-2" placeholder="Describe the progress, issue or media handover update." />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">Creator updates are limited to progress, media handover and notes. Studio can also submit schedule and production-stage changes. Every update is audited; none approves QC, Rights, Legal or DIT verification.</p>
      <div className="mt-3"><Button disabled={mutation.isPending || update.trim().length < 5} onClick={() => mutation.mutate()}>{mutation.isPending ? "Recording…" : "Submit production update"}</Button></div>
    </section>
  );
}
