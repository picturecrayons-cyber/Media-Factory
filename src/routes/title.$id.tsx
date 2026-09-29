import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusRail } from "@/components/bridge/status-rail";
import { getTitle } from "@/lib/bridge/titles";
import { confirmAssetUpload, listTitleAssets, requestAssetUpload } from "@/lib/bridge/assets";
import { getLoopPublication } from "@/lib/bridge/loop-publication";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const WORKSPACE_TABS = [
  "Overview", "Metadata", "Video", "Audio & Dubs", "Subtitles & Accessibility",
  "Artwork", "Documents", "QC", "Legal", "Rights", "Licensing", "Distribution",
  "Loop", "Revenue", "Audit",
] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => <BridgeShell actor={actor} title="Title Workspace"><TitleBody id={id} actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");
  const queryClient = useQueryClient();
  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({ queryKey: ["bridge-assets", id], queryFn: () => listTitleAssets({ data: { titleId: id } }) });
  const pubQ = useQuery({ queryKey: ["loop-pub", id], queryFn: () => getLoopPublication({ data: { bridgeTitleId: id } }) });
  const title = titleQ.data?.title;
  const assets = assetsQ.data?.assets ?? [];
  const pub = pubQ.data?.publication;

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  const ingestReady = assets.length > 0;
  const qcReady = Boolean(title.masterKey);
  const legalReady = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status);
  const rightsReady = legalReady;
  const packageReady = Boolean(qcReady && legalReady);
  const distributionReady = Boolean(pub?.authorizationStatus);

  return (
    <div className="space-y-7">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Crayons Bridge · Canonical Title</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">{title.name}</h1>
            <p className="mt-2 text-xs text-muted">{title.language}{title.year ? ` · ${title.year}` : ""} · <span className="font-mono">{title.id}</span></p>
          </div>
          <p className="rounded-full border border-line bg-elevated px-4 py-2 text-xs text-muted">Signed in · {actor.internalRole || actor.accountType}</p>
        </div>
        <div className="mt-6"><StatusRail status={title.status} /></div>
      </section>

      <section aria-label="Distribution readiness" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Gate label="INGEST" ready={ingestReady} />
        <Gate label="QC" ready={qcReady} />
        <Gate label="LEGAL" ready={legalReady} />
        <Gate label="RIGHTS" ready={rightsReady} />
        <Gate label="PACKAGE" ready={packageReady} />
        <Gate label="AUTHORIZED" ready={distributionReady} />
      </section>

      <nav aria-label="Title Workspace Sections" className="flex gap-2 overflow-x-auto border-b border-line pb-3">
        {WORKSPACE_TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${activeTab === tab ? "bg-fg text-bg font-semibold" : "border border-line bg-surface text-muted hover:text-fg"}`}>
            {tab}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{activeTab}</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-fg">{workspaceHeading(activeTab)}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{workspaceCopy(activeTab)}</p>
        {isAssetTab(activeTab) ? (
          <AssetWorkspace
            titleId={id}
            tab={activeTab}
            assets={assets}
            uploadsOpen={["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)}
            onUploaded={async () => {
              await queryClient.invalidateQueries({ queryKey: ["bridge-assets", id] });
              await queryClient.invalidateQueries({ queryKey: ["bridge-title", id] });
            }}
          />
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Private assets" value={String(assets.length)} />
            <Metric label="Bridge lifecycle" value={title.status} />
            <Metric label="Master" value={title.masterKey ? "VERIFIED" : "REQUIRED"} />
            <Metric label="Crayons Loop" value={pub?.authorizationStatus?.toUpperCase() || "HOLD"} />
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Destination name="Crayons Loop" state={distributionReady ? "AUTHORIZED" : packageReady ? "READY TO PUBLISH" : "HOLD"} detail="Consumer catalog, merchandising, playback and entitlements. Rights remain controlled by Bridge." />
        <Destination name="External destinations" state="AGREEMENT REQUIRED" detail="OTT, broadcast, TVOD, SVOD, AVOD, FAST, airline, festival, educational and controlled buyer delivery activate only against recorded grants." />
      </section>
    </div>
  );
}

type AssetTab = "Video" | "Audio & Dubs" | "Subtitles & Accessibility" | "Artwork" | "Documents";
type UploadKind = "master" | "screener" | "subtitle" | "poster";

const ASSET_OPTIONS: Record<AssetTab, Array<{ label: string; kind: UploadKind; accept: string }>> = {
  Video: [
    { label: "Master", kind: "master", accept: "video/*" },
    { label: "Trailer / Screener", kind: "screener", accept: "video/*" },
  ],
  "Audio & Dubs": [
    { label: "Audio / Dub / M&E / Descriptive Audio", kind: "screener", accept: "audio/*" },
  ],
  "Subtitles & Accessibility": [
    { label: "Subtitle / SDH / CC / Forced Narrative", kind: "subtitle", accept: ".srt,.vtt,.ttml,.xml,text/*,application/ttml+xml" },
  ],
  Artwork: [
    { label: "Poster / Artwork", kind: "poster", accept: "image/*" },
  ],
  Documents: [
    { label: "Private document / rights evidence", kind: "screener", accept: ".pdf,.doc,.docx,image/*,application/pdf" },
  ],
};

function isAssetTab(tab: WorkspaceTab): tab is AssetTab {
  return tab === "Video" || tab === "Audio & Dubs" || tab === "Subtitles & Accessibility" || tab === "Artwork" || tab === "Documents";
}

function AssetWorkspace({ titleId, tab, assets, uploadsOpen, onUploaded }: {
  titleId: string;
  tab: AssetTab;
  assets: Array<{ id: string; kind: string; contentType: string | null; byteSize: number | null; verified: boolean; createdAt: string }>;
  uploadsOpen: boolean;
  onUploaded: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const options = ASSET_OPTIONS[tab];
  const option = options[optionIndex] ?? options[0];

  async function upload(file: File) {
    if (!uploadsOpen || !option) return;
    setBusy(true); setProgress(0); setMessage(null);
    try {
      const signed = await requestAssetUpload({ data: { titleId, kind: option.kind, filename: file.name, contentType: file.type || "application/octet-stream" } });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signed.url);
        for (const [key, value] of Object.entries(signed.headers ?? {})) xhr.setRequestHeader(key, String(value));
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        xhr.onerror = () => reject(new Error("Upload failed before S3 confirmation"));
        xhr.send(file);
      });
      await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
      setProgress(100); setMessage(`${file.name} verified and sealed.`);
      await onUploaded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const visible = assets.filter((asset) => {
    if (tab === "Video") return asset.kind === "master" || asset.kind === "screener";
    if (tab === "Subtitles & Accessibility") return asset.kind === "subtitle";
    if (tab === "Artwork") return asset.kind === "poster";
    return asset.kind === "screener";
  });

  return <div className="mt-6 space-y-5">
    <div className="rounded-2xl border border-line bg-elevated/40 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-xs font-semibold text-fg">Asset type
          <select value={optionIndex} onChange={(e) => setOptionIndex(Number(e.target.value))} disabled={busy || !uploadsOpen} className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm">
            {options.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
          </select>
        </label>
        <input ref={inputRef} type="file" accept={option.accept} disabled={busy || !uploadsOpen} className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
        <button type="button" disabled={busy || !uploadsOpen} onClick={() => inputRef.current?.click()} className="rounded-xl bg-fg px-5 py-3 text-xs font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? `Uploading ${progress}%` : "Add file"}
        </button>
      </div>
      {!uploadsOpen && <p className="mt-3 text-xs text-muted">Uploads are locked after the preparing stage.</p>}
      {busy && <div className="mt-4 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>}
      {message && <p role="status" className="mt-3 text-xs text-muted">{message}</p>}
    </div>
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">Verified private assets</h3>
      {visible.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-xs text-muted">No files uploaded in this section.</p> :
        visible.map((asset) => <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
          <div><p className="text-sm font-semibold text-fg">{asset.kind.toUpperCase()}</p><p className="mt-1 text-xs text-muted">{asset.contentType || "unknown type"} · {asset.byteSize ? `${(asset.byteSize / 1024 / 1024).toFixed(2)} MB` : "verifying"}</p></div>
          <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold text-muted">{asset.verified ? "VERIFIED & SEALED" : "PROCESSING"}</span>
        </div>)}
    </div>
  </div>;
}

function Gate({ label, ready }: { label: string; ready: boolean }) {
  return <div className="rounded-xl border border-line bg-surface p-3"><p className="text-[10px] font-semibold tracking-wider text-muted">{label}</p><p className="mt-1 text-xs font-semibold text-fg">{ready ? "PASS" : "PENDING"}</p></div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line bg-elevated/40 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold text-fg">{value}</p></div>;
}
function Destination({ name, state, detail }: { name: string; state: string; detail: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-display text-lg font-semibold text-fg">{name}</h3><span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold text-muted">{state}</span></div><p className="mt-3 text-xs leading-5 text-muted">{detail}</p></article>;
}
function workspaceHeading(tab: WorkspaceTab) {
  const map: Record<WorkspaceTab, string> = {
    Overview: "Title supply-chain overview", Metadata: "Title & metadata", Video: "Video masters & versions", "Audio & Dubs": "Audio, M&E and dubbed versions", "Subtitles & Accessibility": "Subtitles, captions and accessibility", Artwork: "Artwork & promotional", Documents: "Certification & legal evidence", QC: "Technical QC desk", Legal: "Legal approval desk", Rights: "Rights & avails", Licensing: "Licensing & commercial grants", Distribution: "Destination packages", Loop: "Crayons Loop publication", Revenue: "Revenue & settlement", Audit: "Immutable activity trail",
  }; return map[tab];
}
function workspaceCopy(tab: WorkspaceTab) {
  const map: Record<WorkspaceTab, string> = {
    Overview: "One immutable Bridge UUID connects ingest, assets, QC, legal, rights, licensing and every authorized delivery.",
    Metadata: "Capture canonical consumer and business metadata without using display slugs as system identity.",
    Video: "Manage original mezzanine, clean/textless, alternate/platform cuts and trailers as versioned private assets.",
    "Audio & Dubs": "Track original mixes, stereo, 5.1, M&E, stems, audio description and dubbed languages independently.",
    "Subtitles & Accessibility": "Keep subtitles, SDH/CC, forced narrative and translated accessibility tracks as separate records.",
    Artwork: "Approve portrait, landscape/hero, square, title treatment, stills and promotional variants per destination.",
    Documents: "Store classification, chain-of-title, producer authority, music/artwork rights, releases and distribution evidence privately.",
    QC: "Technical QC is an independent gate with automated findings, reviewer findings and repair cycles.",
    Legal: "Legal approval is separate from QC and must be explicitly cleared before distribution authorization.",
    Rights: "Record territory, language, media, window, exclusivity, holdbacks, sublicensing, promotional rights and restrictions.",
    Licensing: "Create contract-backed grants and commercial terms while preserving Bridge as the rights authority.",
    Distribution: "Build destination-specific package versions only after QC, legal and rights gates pass.",
    Loop: "Publish only the approved consumer projection to Loop; never expose masters, contracts or legal evidence to the consumer runtime.",
    Revenue: "Reconcile destination usage, consumer revenue, shares and settlements back to the canonical Bridge title.",
    Audit: "Record approvals, grants, package versions, publication, suspension and revocation against the immutable title UUID.",
  }; return map[tab];
}
