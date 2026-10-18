import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublishingGatewayStatus, requestPublishingGatewayRelease } from "@/lib/bridge/publishing-gateway";
import type { PublishingGatewayGate } from "@/lib/bridge/publishing-gateway-policy";

type GatewayStatus = {
  ready: boolean;
  releaseStatus: string;
  checks: PublishingGatewayGate[];
  checkedAt: string;
};

function GateIcon({ status }: { status: PublishingGatewayGate["status"] }) {
  if (status === "VERIFIED") return <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-600" />;
  if (status === "BLOCKED") return <AlertTriangle aria-hidden="true" className="h-5 w-5 text-red-600" />;
  return <CircleHelp aria-hidden="true" className="h-5 w-5 text-muted" />;
}

export function PublishingGatewayControl({ actorRole }: { actorRole: string | null }) {
  const [explicitApproval, setExplicitApproval] = useState(false);
  const statusQ = useQuery({
    queryKey: ["publishing-gateway-status"],
    queryFn: () => getPublishingGatewayStatus(),
    retry: false,
  });
  const releaseM = useMutation({
    mutationFn: () => requestPublishingGatewayRelease({ data: { explicitApproval: true } }),
    onSuccess: async () => {
      setExplicitApproval(false);
      await statusQ.refetch();
    },
  });
  const status = statusQ.data as GatewayStatus | undefined;
  const checks = status?.checks ?? [];
  const isSuperAdmin = actorRole === "super_admin";
  const releaseReady = status?.ready === true && checks.length > 0 && checks.every((item) => item.status === "VERIFIED");
  const errorText = (error: unknown) => error instanceof Error ? error.message : "Verification is unavailable.";

  return (
    <section aria-labelledby="publishing-gateway-heading" className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl border border-line p-3"><ShieldCheck aria-hidden="true" className="h-6 w-6" /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge Admin · Release gate</p>
            <h3 id="publishing-gateway-heading" className="mt-1 font-display text-2xl font-semibold">Publishing Gateway</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted">Read-only verification for crayonsloop.in and crayonspictures.in. Production stays on HOLD unless every required gate is verified.</p>
          </div>
        </div>
        <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${releaseReady ? "border-emerald-600/40 text-emerald-700" : "border-amber-600/40 text-amber-700"}`}>
          {releaseReady ? "READY FOR APPROVAL" : "HOLD"}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void statusQ.refetch()} disabled={statusQ.isFetching}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${statusQ.isFetching ? "animate-spin" : ""}`} />
          {statusQ.isFetching ? "Checking…" : "Verify status"}
        </Button>
        <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold hover:bg-accent-soft">Open CrayonsLoop.in ↗</a>
        <a href="https://crayonspictures.in/" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold hover:bg-accent-soft">Open CrayonsPictures.in ↗</a>
      </div>

      {statusQ.isError ? <p role="alert" className="mt-4 rounded-xl border border-line p-3 text-sm text-muted">{errorText(statusQ.error)} The release gate remains HOLD.</p> : null}
      {statusQ.isPending ? <p className="mt-4 text-sm text-muted">Run verification to collect current GitHub, Vercel, domain and smoke-test evidence.</p> : null}

      {checks.length > 0 ? (
        <ul className="mt-5 divide-y divide-line rounded-2xl border border-line">
          {checks.map((item) => (
            <li key={item.id} className="flex items-start gap-3 p-3 sm:p-4">
              <GateIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-1 break-words text-xs leading-relaxed text-muted">{item.detail}</p>
              </div>
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">{item.status}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {status?.checkedAt ? <p className="mt-3 text-xs text-muted">Last checked: {new Date(status.checkedAt).toLocaleString()}</p> : null}

      <div className="mt-5 rounded-2xl border border-line p-4">
        <p className="text-sm font-semibold">Guarded release approval</p>
        <p className="mt-1 text-sm text-muted">Requires super-admin authorization and every gate VERIFIED. Approval is recorded in the Bridge audit log only; this control does not deploy, promote or modify Production.</p>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-current" checked={explicitApproval} onChange={(event) => setExplicitApproval(event.target.checked)} disabled={!isSuperAdmin || !releaseReady || releaseM.isPending} />
          <span>I explicitly approve recording the release approval after all required checks pass.</span>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="danger" disabled={!isSuperAdmin || !releaseReady || !explicitApproval || releaseM.isPending} onClick={() => {
            if (explicitApproval && releaseReady && window.confirm("Record Publishing Gateway release approval? This will NOT deploy or change Production.")) releaseM.mutate();
          }}>
            {releaseM.isPending ? "Recording…" : "Record release approval"}
          </Button>
          {!isSuperAdmin ? <span className="text-xs text-muted">Super-admin role required.</span> : null}
          {!releaseReady ? <span className="text-xs text-muted">Disabled until all checks are verified.</span> : null}
        </div>
        {releaseM.isError ? <p role="alert" className="mt-3 text-sm text-muted">{errorText(releaseM.error)} Production remains unchanged.</p> : null}
        {releaseM.data?.approved ? <p role="status" className="mt-3 text-sm text-muted">{releaseM.data.message}</p> : null}
      </div>
    </section>
  );
}
