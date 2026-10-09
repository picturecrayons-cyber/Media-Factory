import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";
import type { Actor } from "@/lib/bridge/rbac";
import { VENDOR_JOB_TYPES, type VendorJobType } from "@/lib/delivery/vendor-jobs";
import {
  listVendorJobs,
  listVendorServiceCatalog,
  createPersistentVendorJob,
} from "@/lib/delivery/vendor-jobs.server";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

const LABELS: Record<VendorJobType, string> = {
  dubbing: "Dubbing request",
  loudness_check: "Loudness check (not a Dolby encode)",
  imf_request: "IMF package request",
  dcp_request: "DCP package request",
  human_qc: "Human QC",
  subtitles_localization: "Subtitles & localization",
  audio_description: "Audio description",
  color_finishing: "AI post-production & color",
  ott_delivery: "OTT master delivery",
  poster_campaign: "Poster & campaign generation",
};
const money = (paise: number | null | undefined) =>
  paise == null ? "Vendor quote required" : "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function Deliveries() {
  return <RequireBridge>{(actor) => (
    <BridgeShell actor={actor} title="Deliveries">
      <VendorJobs actor={actor} />
      <DeliveryList />
    </BridgeShell>
  )}</RequireBridge>;
}

function VendorJobs({ actor }: { actor: Actor }) {
  const canRequest = hasPermission(actor, "title.deliver") || hasPermission(actor, "title.create") ||
    hasPermission(actor, "service.quote_create") || hasPermission(actor, "service.order_create");
  const queryClient = useQueryClient();
  const [type, setType] = useState<VendorJobType>("human_qc");
  const [titleId, setTitleId] = useState("");
  const [serviceLane, setServiceLane] = useState<"managed" | "self_service">("managed");
  const [note, setNote] = useState("");
  const [language, setLanguage] = useState("Malayalam");
  const [runtime, setRuntime] = useState("");
  const [deadline, setDeadline] = useState("");
  const [resolution, setResolution] = useState("4K");
  const [audio, setAudio] = useState("5.1");
  const [encryption, setEncryption] = useState("not_required");
  const [message, setMessage] = useState("");
  const titlesQuery = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const jobsQuery = useQuery({ queryKey: ["bridge-vendor-jobs"], queryFn: () => listVendorJobs() });
  const catalogQuery = useQuery({ queryKey: ["bridge-vendor-service-catalog"], queryFn: () => listVendorServiceCatalog() });
  const createJob = useMutation({
    mutationFn: () => createPersistentVendorJob({ data: {
      titleId, type, serviceLane,
      scope: {
        language, runtimeMinutes: runtime ? Number(runtime) : undefined,
        deadline: deadline || undefined, resolution, audio, encryption, kdmRequired: encryption === "encrypted_kdm",
      },
      note, idempotencyKey: crypto.randomUUID(),
    } }),
    onSuccess: async (result) => {
      setMessage(result.streamVistaState === "not_connected"
        ? "Job saved in Bridge. StreamVista routing is not connected; this is not a vendor assignment."
        : "Vendor job saved.");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["bridge-vendor-jobs"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not save vendor job."),
  });
  const titles = titlesQuery.data?.titles ?? [];
  const catalog = catalogQuery.data?.catalog ?? [];
  const jobs = jobsQuery.data?.jobs ?? [];
  const selectedPrices = catalog.filter((price) => price.serviceType === type);

  return <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <h2 className="font-display text-xl font-semibold">Vendor Jobs · Technical Services Marketplace</h2>
    <p className="mt-1 text-sm text-muted">Request a specialist. Indicative prices are estimates, not confirmed vendor quotes. No automatic Dolby, IMF or DCP master. Release only after human sign-off.</p>
    {canRequest ? <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm"><span>Film / title</span>
          <select className="rounded-lg border border-line bg-transparent px-3 py-2" value={titleId} onChange={(e) => setTitleId(e.target.value)}>
            <option value="">Select a Bridge title</option>
            {titles.map((title) => <option key={title.id} value={title.id}>{title.name} · {title.id.slice(0, 8)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm"><span>Service</span>
          <select className="rounded-lg border border-line bg-transparent px-3 py-2" value={type} onChange={(e) => setType(e.target.value as VendorJobType)}>
            {VENDOR_JOB_TYPES.map((jobType) => <option key={jobType} value={jobType}>{LABELS[jobType]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm"><span>Workflow</span>
          <select className="rounded-lg border border-line bg-transparent px-3 py-2" value={serviceLane} onChange={(e) => setServiceLane(e.target.value as "managed" | "self_service")}>
            <option value="managed">Managed support · human QC</option><option value="self_service">Self-service · scope permitting</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm"><span>Language</span><input className="rounded-lg border border-line bg-transparent px-3 py-2" value={language} onChange={(e) => setLanguage(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span>Runtime (minutes, if applicable)</span><input className="rounded-lg border border-line bg-transparent px-3 py-2" type="number" min="1" max="600" value={runtime} onChange={(e) => setRuntime(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span>Requested deadline</span><input className="rounded-lg border border-line bg-transparent px-3 py-2" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span>Master resolution</span><select className="rounded-lg border border-line bg-transparent px-3 py-2" value={resolution} onChange={(e) => setResolution(e.target.value)}><option>HD</option><option>2K</option><option>4K</option><option>Other / vendor advice</option></select></label>
        <label className="grid gap-1 text-sm"><span>Audio format</span><select className="rounded-lg border border-line bg-transparent px-3 py-2" value={audio} onChange={(e) => setAudio(e.target.value)}><option>Stereo</option><option>5.1</option><option>7.1</option><option>Atmos / vendor quote</option></select></label>
        <label className="grid gap-1 text-sm"><span>Encryption / KDM</span><select className="rounded-lg border border-line bg-transparent px-3 py-2" value={encryption} onChange={(e) => setEncryption(e.target.value)}><option value="not_required">Not required</option><option value="encrypted_kdm">Encryption + KDM required</option><option value="needs_vendor_advice">Need vendor advice</option></select></label>
      </div>
      {selectedPrices.map((price) => <div key={price.id} className="rounded-xl border border-line p-3 text-sm">
        <p className="font-semibold">{price.displayName}</p>
        <p className="mt-1 text-muted">{price.indicativeMinPaise == null || price.indicativeMaxPaise == null ? "Price on request" : money(price.indicativeMinPaise) + " – " + money(price.indicativeMaxPaise) + " · " + price.pricingUnit.replaceAll("_", " ")}</p>
        <p className="text-xs text-muted">Indicative market estimate · {price.quoteRequired ? "Vendor quote required" : "Scope must be confirmed"} · taxes confirmed in final quote</p>
        {price.sourceUrl ? <a className="text-xs underline" href={price.sourceUrl} target="_blank" rel="noreferrer">Pricing reference</a> : null}
      </div>)}
      <label className="grid gap-1 text-sm"><span>Technical scope / special instructions</span><textarea className="rounded-lg border border-line bg-transparent px-3 py-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="M&E availability, sync requirements, output profiles and reference specs" /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!titleId || createJob.isPending} className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50" onClick={() => createJob.mutate()}>{createJob.isPending ? "Saving…" : "Create vendor job"}</button>
        <span className="text-xs text-muted">No charge at request stage. Payment requires an approved quote.</span>
      </div>
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      {catalogQuery.isError ? <p className="text-sm text-amber-500">Pricing catalogue could not load. Do not assume displayed estimates are current.</p> : null}
    </div> : <p className="mt-3 text-sm text-muted">Requesting requires delivery or service-order permission.</p>}
    <div className="mt-6">
      <h3 className="font-semibold">Live vendor jobs</h3>
      {jobsQuery.isPending ? <p className="mt-2 text-sm text-muted">Loading jobs…</p> : jobsQuery.isError ? <p role="alert" className="mt-2 text-sm">Vendor jobs unavailable. Check migration and access controls.</p> : <div className="mt-3 divide-y divide-line rounded-xl border border-line">
        {jobs.map((job) => <div key={job.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div><p className="text-sm font-semibold">{job.titleName} · {LABELS[job.type as VendorJobType] ?? job.type}</p>
            <p className="mt-1 text-xs text-muted">Job {job.id} · {job.serviceLane} · {job.status.replaceAll("_", " ")}</p>
            <p className="text-xs text-muted">Payment: {job.paymentStatus} · {job.deliverableAvailable ? "Deliverable attached" : "No deliverable"} · {job.signedOff ? "Signed off" : "Awaiting sign-off"}</p>
            {job.indicativeMinPaise != null && job.indicativeMaxPaise != null ? <p className="text-xs text-muted">Indicative estimate: {money(job.indicativeMinPaise)}–{money(job.indicativeMaxPaise)} · final price awaits quote</p> : null}
          </div><span className="h-fit rounded-full border border-line px-3 py-1 text-xs">{job.status}</span>
        </div>)}
        {!jobs.length ? <p className="p-4 text-sm text-muted">No vendor jobs yet.</p> : null}
      </div>}
    </div>
  </section>;
}

function DeliveryList() {
  const q = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = q.data?.titles ?? [];
  if (q.isError) return <p role="alert">Delivery data is unavailable. Refresh to retry.</p>;
  if (q.isPending) return <p className="text-sm text-muted">Loading deliveries…</p>;
  return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <h2 className="font-display text-xl font-semibold">Delivery desk</h2>
    <p className="mt-1 text-sm text-muted">Open a title to review its canonical Delivery workspace. No rights or fulfilment rules are changed here.</p>
    <div className="mt-5 divide-y divide-line rounded-xl border border-line">
      {titles.map((t) => <Link key={t.id} to="/title/$id" params={{ id: t.id }} className="flex items-center justify-between gap-3 p-4 hover:bg-fg/5">
        <div><p className="text-sm font-semibold">{t.name}</p><p className="text-xs text-muted">{t.language}{t.year ? ` · ${t.year}` : ""}</p></div>
        <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold">{t.status === "DELIVERED" ? "DELIVERED" : "OPEN TITLE"}</span>
      </Link>)}
    </div>
    {!titles.length ? <p className="mt-5 text-sm text-muted">No titles available.</p> : null}
  </section>;
}
