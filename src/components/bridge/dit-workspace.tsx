import { ArrowUpRight, AudioLines, Camera, Cloud, Film, Image, ShieldCheck, Workflow } from "lucide-react";
import type { BridgeActor } from "@/lib/bridge/session";
import { canAccessDitWorkspace } from "@/lib/bridge/rbac";

type Workstream = {
  title: string;
  description: string;
  detail: string;
  icon: typeof Camera;
};

const WORKSTREAMS: Workstream[] = [
  {
    title: "RAW video & camera cards",
    description: "Camera, card, roll and clip-level ingest with resumable transfer.",
    detail: "Card ingest adapter not connected",
    icon: Camera,
  },
  {
    title: "Audio",
    description: "Production audio intake, source matching and independent copy checks.",
    detail: "Audio ingest adapter not connected",
    icon: AudioLines,
  },
  {
    title: "Stills & locations",
    description: "Still-photo and location/area assets organized by shooting day.",
    detail: "Stills ingest adapter not connected",
    icon: Image,
  },
  {
    title: "Proxy & ProRes",
    description: "Approved profiles, derived-media lineage, probe results and QC.",
    detail: "Transcoding worker not connected",
    icon: Film,
  },
];

function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {children}
    </span>
  );
}

function WorkstreamCard({ item }: { item: Workstream }) {
  const Icon = item.icon;
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg text-accent">
          <Icon aria-hidden="true" size={19} />
        </span>
        <StatusPill>Not connected</StatusPill>
      </div>
      <h3 className="mt-4 font-semibold">{item.title}</h3>
      <p className="mt-1 min-h-10 text-sm leading-6 text-muted">{item.description}</p>
      <p className="mt-4 border-t border-line pt-3 text-xs font-medium text-muted">{item.detail}</p>
    </article>
  );
}

export function DitWorkspace({ actor }: { actor: BridgeActor }) {
  if (!canAccessDitWorkspace(actor)) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="dit-access-title">
        <h2 id="dit-access-title" className="font-semibold">DIT workspace access required</h2>
        <p className="mt-1 text-sm text-muted">
          This workspace is available to verified Studio accounts with the dedicated DIT permission.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="dit-workspace-title">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent">
                <Workflow size={13} aria-hidden="true" /> Studio production
              </span>
              <StatusPill>Foundation mode</StatusPill>
            </div>
            <h2 id="dit-workspace-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              DIT Agent workspace
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              One controlled workspace for camera-card RAW, production audio, stills and location assets,
              verified copies, and derived Proxy / ProRes media.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-bg p-4 lg:min-w-52">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Production records</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">—</p>
            <p className="mt-1 text-xs text-muted">Persistent workspace not connected</p>
          </div>
        </div>
        <div className="grid gap-3 border-t border-line bg-bg/60 p-4 sm:grid-cols-3 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-accent" size={18} aria-hidden="true" />
            <div><p className="text-sm font-semibold">Evidence-first gates</p><p className="mt-1 text-xs leading-5 text-muted">No PASS without measured evidence.</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Cloud className="mt-0.5 shrink-0 text-accent" size={18} aria-hidden="true" />
            <div><p className="text-sm font-semibold">Three-copy policy</p><p className="mt-1 text-xs leading-5 text-muted">MASTER + physical BACKUP + cloud BACKUP.</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Workflow className="mt-0.5 shrink-0 text-accent" size={18} aria-hidden="true" />
            <div><p className="text-sm font-semibold">Human sign-off</p><p className="mt-1 text-xs leading-5 text-muted">Card reuse stays blocked until all gates pass.</p></div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold">Production workstreams</h3>
          <p className="mt-1 text-sm text-muted">The workspace is scaffolded; operational adapters are still pending.</p>
        </div>
        <button type="button" disabled title="Available after the persistent production workspace and ingest adapters are implemented" className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted opacity-60">
          New production <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {WORKSTREAMS.map((item) => <WorkstreamCard key={item.title} item={item} />)}
      </div>

      <div className="rounded-2xl border border-line bg-bg p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Operational verification gates</h3>
            <p className="mt-1 text-xs text-muted">These are implementation gates, not completed production checks.</p>
          </div>
          <StatusPill>Not yet verified</StatusPill>
        </div>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {[
            "Resumable ingest and restart recovery",
            "Manifest reconciliation: clip count, byte size and SHA-256",
            "Independent physical MASTER and BACKUP verification",
            "Independent cloud BACKUP verification",
            "Real media probe and Proxy / ProRes output QC",
            "Durable jobs, audit history and authenticated sign-off",
          ].map((gate) => (
            <li key={gate} className="flex items-start gap-2 text-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              {gate}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs leading-5 text-muted">
        Safety boundary: this screen does not read or write camera cards, local disks, OCI/object storage,
        databases or transcoding services. No transfer, backup, conversion or sign-off is claimed complete.
      </p>
    </section>
  );
}
