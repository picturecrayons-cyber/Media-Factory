import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getDitAgentStatus, listDitIngestSessions } from "@/lib/bridge/dit";

export const Route = createFileRoute("/studio/dit")({ component: StudioDitPage });

function StudioDitPage() {
  return <RequireBridge allow="studio">{(actor) => <BridgeShell actor={actor} title="Studio DIT"><StudioDitDesk /></BridgeShell>}</RequireBridge>;
}

function StudioDitDesk() {
  const statusQ = useQuery({ queryKey: ["dit-agent-status"], queryFn: () => getDitAgentStatus() });
  const sessionsQ = useQuery({ queryKey: ["dit-ingest-sessions"], queryFn: () => listDitIngestSessions() });
  const status = statusQ.data;
  const sessions = sessionsQ.data?.sessions ?? [];
  const money = status?.amountPaise == null ? "Not configured" : "₹" + (Number(status.amountPaise) / 100).toLocaleString("en-IN");
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Paid Studio service</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">DIT Agent · {money}</h2>
        <p className="mt-2 text-sm text-muted">DIT upload and sign-off remain fail-closed until payment, Studio membership and three-copy storage schema are verified.</p>
        {statusQ.isError ? <p role="alert" className="mt-3 text-sm">DIT status could not be loaded.</p> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Service / rate</p><p className="mt-1 text-sm font-semibold">{status?.serviceActive ? "ACTIVE" : status?.serviceConfigured ? "INACTIVE" : "NOT CONFIGURED"}</p></div>
          <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Razorpay payment</p><p className="mt-1 text-sm font-semibold">{status?.paid ? "VERIFIED" : "NOT PAID"}</p></div>
          <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Three-copy schema</p><p className="mt-1 text-sm font-semibold">{status?.schemaReady ? "READY" : "BLOCKED"}</p></div>
          <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Studio organization</p><p className="mt-1 text-sm font-semibold">{status?.organizationReady ? "VERIFIED" : "MISSING"}</p></div>
        </div>
        {status?.blockers?.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">{status.blockers.map((reason: string) => <li key={reason}>{reason}</li>)}</ul> : null}
        <p className="mt-4 rounded-xl border border-line p-3 text-xs text-muted">Upload controls are deliberately disabled. No OCI upload, copy, or database write can be triggered from this page until the missing fee configuration and reviewed STAGING migration are in place.</p>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-display text-xl font-semibold">DIT ingest sessions</h3>
        <div className="mt-3 space-y-2">
          {sessions.map((session: any) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="text-sm font-semibold">{session.camera_label ?? session.camera_unit} · {session.card_label}</p><p className="mt-1 text-xs text-muted">{session.shoot_date} · {session.source_file_count} files · {session.source_total_bytes} bytes</p></div><span className="rounded-full border border-line px-2 py-1 text-xs">{session.status}</span></div>)}
          {!sessionsQ.isPending && sessions.length === 0 ? <p className="text-sm text-muted">No DIT ingest sessions recorded for this Studio organization.</p> : null}
        </div>
      </section>
    </div>
  );
}
