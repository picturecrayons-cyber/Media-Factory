import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { getTitleWorkflow } from "@/lib/bridge/workflow";
import { WorkflowDesk } from "@/components/bridge/workflow-desk";
import { publicationIsActive } from "@/lib/bridge/workflow-policy";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle, updateTitle } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import {
  confirmAssetUpload,
  listTitleAssets,
  requestAssetDownload,
  requestAssetUpload,
} from "@/lib/bridge/assets";
import { getLoopPublication } from "@/lib/bridge/loop-publication";
import type { BridgeActor } from "@/lib/bridge/session";
import {
  OTT_INGEST_SPEC,
  getOttIngestAccept,
  validateOttIngestFile,
} from "@/lib/bridge/ott-ingest-spec";
import { asciiUploadName } from "@/lib/bridge/latin1";
import { createUploadSnapshot, evaluateUploadStall, formatUploadBytes, recordTransferProgress, setUploadStage, type MasterUploadSnapshot } from "@/lib/bridge/upload-status";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const WORKSPACE_TABS = ["Overview", "Files"] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

function LaneStore({ titleId, stored, locked }: { titleId: string; stored: string; locked: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(stored);
  const save = useMutation({
    mutationFn: (contentType: string) => updateTitle({ data: { id: titleId, contentType } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] }),
  });
  return (
    <label className="mt-4 block text-sm">
      Stored for Loop preview
      <select
        value={value}
        disabled={locked || save.isPending}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          save.mutate(next);
        }}
        className="mt-1 h-11 w-full max-w-sm rounded-lg border border-line-strong bg-elevated px-3"
      >
        {BRIDGE_LOOP_LANES.map((lane) => (
          <option key={lane.id} value={lane.loopType}>{lane.label}</option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted">
        {locked ? "Locked after prepare. Staff can still correct it before publish." : "Saved on the Bridge title. Loop shows it only after TVOD publish."}
        {save.isError ? ` ${save.error instanceof Error ? save.error.message : "Could not save."}` : ""}
      </span>
    </label>
  );
}

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Title Workspace">
          <TitleBody id={id} actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");

  const titleQ = useQuery({
    queryKey: ["bridge-title", id],
    queryFn: () => getTitle({ data: { id } }),
  });
  const assetsQ = useQuery({
    queryKey: ["bridge-assets", id],
    queryFn: () => listTitleAssets({ data: { titleId: id } }),
  });
  const pubQ = useQuery({
    queryKey: ["loop-pub", id],
    queryFn: () => getLoopPublication({ data: { bridgeTitleId: id } }),
  });

  const reviewQ = useQuery({
    queryKey: ["title-workflow", id],
    queryFn: () => getTitleWorkflow({ data: { titleId: id } }),
    enabled: Boolean(actor.internalRole) || actor.accountType !== "buyer",
  });
  const title = titleQ.data?.title;
  const assets = assetsQ.data?.assets ?? [];
  const pub = pubQ.data?.publication;

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (titleQ.isError)
    return <p role="alert">Title workspace unavailable: {titleQ.error.message}</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  const qcReady =
    reviewQ.data?.qc?.status === "PASSED" &&
    reviewQ.data.qc.reviewer_findings[0]?.masterKey === title.masterKey;
  const legalReady = [
    "LICENSING_READY",
    "LIVE_FOR_BUYERS",
    "IN_NEGOTIATION",
    "LICENSED",
    "DELIVERED",
  ].includes(title.status);
  const rightsReady =
    reviewQ.data?.legal?.status === "APPROVED" &&
    reviewQ.data.grants.some((g) => g.status === "VALID" && new Date(g.window_end) > new Date());
  const packageReady = Boolean(qcReady && legalReady);
  const distributionReady = Boolean(
    pub && publicationIsActive(pub.authorizationStatus, pub.windowStart, pub.windowEnd),
  );

  return (
    <div className="space-y-5">
      <WorkflowDesk title={title} actor={actor} />
      {assetsQ.isError ? <p role="alert">Assets unavailable: {assetsQ.error.message}</p> : null}
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <div className="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-elevated">
            <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">
              {assets.some((asset) => ["poster_vertical", "poster"].includes(asset.kind))
                ? "Vertical poster ready"
                : "Add vertical poster"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  Title
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold text-fg sm:text-3xl">
                  {title.name}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  {title.language}
                  {title.year ? ` · ${title.year}` : ""}
                  {title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}
                </p>
              </div>
              <span className="rounded-full border border-line bg-elevated px-3 py-1.5 text-xs font-semibold">
                {title.status}
              </span>
            </div>
            {title.synopsis ? (
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{title.synopsis}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {title.credits?.some((c) => c.role === "Director") ? (
                <span>
                  <span className="text-muted">Director</span> ·{" "}
                  {title.credits
                    .filter((c) => c.role === "Director")
                    .map((c) => c.name)
                    .join(", ")}
                </span>
              ) : null}
              {title.credits?.some((c) => c.role === "Cast") ? (
                <span>
                  <span className="text-muted">Cast</span> ·{" "}
                  {title.credits
                    .filter((c) => c.role === "Cast")
                    .map((c) => c.name)
                    .join(", ")}
                </span>
              ) : null}
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setActiveTab("Files")}
                className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg"
              >
                Upload Files
              </button>
            </div>
          </div>
        </div>
      </section>

      <nav
        aria-label="Title Workspace Sections"
        className="flex gap-1 overflow-x-auto border-b border-line pb-3"
      >
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${activeTab === tab ? "bg-fg text-bg font-semibold" : "text-muted hover:bg-surface hover:text-fg"}`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" ? (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Metadata</p>
              <h2 className="mt-1 font-display text-xl font-semibold">OTT title details</h2>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{title.status}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Original title" value={title.nameMl || "—"} />
            <Metric label="Content type" value={loopStageType(title.contentType)} />
            <Metric label="Language" value={title.language || "—"} />
            <Metric label="Year" value={title.year ? String(title.year) : "—"} />
            <Metric label="Runtime" value={title.runtimeMinutes ? `${title.runtimeMinutes} min` : "—"} />
            <Metric label="Country" value={title.countryOfOrigin || "—"} />
            <Metric label="Release date" value={title.releaseDate || "—"} />
            <Metric label="Director" value={title.credits?.filter((c) => c.role === "Director").map((c) => c.name).join(", ") || "—"} />
            <Metric label="Producer" value={title.credits?.filter((c) => c.role === "Producer").map((c) => c.name).join(", ") || "—"} />
          </div>
          <LaneStore key={title.contentType} titleId={title.id} stored={loopStageType(title.contentType)} locked={!actor.internalRole && !["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)} />
          {title.synopsis ? <p className="mt-4 text-sm leading-6 text-muted">{title.synopsis}</p> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="QC" value={qcReady ? "READY" : "PENDING"} />
            <Metric label="Rights" value={rightsReady ? "READY" : "PENDING"} />
            <Metric label="Licensing" value={legalReady ? "READY" : "PENDING"} />
            <Metric label="Publish" value={distributionReady ? "LIVE" : packageReady ? "READY" : "PENDING"} />
          </div>
        </section>
      ) : activeTab === "Files" ? (
        <FilesPanel
          canUpload={
            canOperateOnTitle(actor, title, "asset.sign_upload", "title.ingest_internal") &&
            ["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)
          }
          titleId={id}
          assets={assets}
          onAssetsChanged={() => assetsQ.refetch()}
        />
      ) : null}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-elevated/40 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

type SimpleAssetKind = "master" | "poster_vertical" | "poster_horizontal" | "thumbnail" | "subtitle" | "screener" | "censor_certificate";

function storageErrorDetail(responseText: string): string {
  const code = responseText.match(/<Code>\\s*([^<]{1,80})\\s*<\\/Code>/i)?.[1]?.trim();
  const message = responseText.match(/<Message>\\s*([^<]{1,200})\\s*<\\/Message>/i)?.[1]
    ?.replace(/https?:\\/\\/\\S+/gi, "[url]")
    .replace(/[\\r\\n\\t]+/g, " ")
    .trim();
  return [code, message].filter(Boolean).join(": ").slice(0, 240);
}
function FilesPanel({
  titleId,
  assets,
  onAssetsChanged,
  canUpload,
}: {
  canUpload: boolean;
  titleId: string;
  assets: Array<{
    id: string;
    kind: string;
    contentType: string | null;
    byteSize: number | null;
    verified: boolean;
  }>;
  onAssetsChanged: () => Promise<unknown> | unknown;
}) {
  const [uploading, setUploading] = useState<SimpleAssetKind | null>(null);
  const [status, setStatus] = useState<MasterUploadSnapshot | null>(null);

  useEffect(() => {
    if (!status || status.stage !== "transferring") return;
    const timer = window.setInterval(() => {
      setStatus((current) => current ? evaluateUploadStall(current, Date.now()) : current);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [status?.stage, status?.lastProgressAt]);

  function putFileWithProgress(url: string, method: string, file: File, contentType: string) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(method, url);
      request.setRequestHeader("content-type", contentType);
      request.timeout = 30 * 60 * 1000;
      request.upload.onprogress = (event) => {
        setStatus((current) => current ? recordTransferProgress(
          current, event.loaded, event.lengthComputable && event.total > 0 ? event.total : null, Date.now(),
        ) : current);
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) { resolve(); return; }
        const detail = storageErrorDetail(request.responseText || "");
        reject(new Error(`Storage upload failed (HTTP ${request.status})${detail ? `: ${detail}` : ""}`));
      };
      request.onerror = () => reject(new Error("The storage request failed before a response arrived. Check network connectivity and storage CORS; no verification was completed."));
      request.ontimeout = () => reject(new Error("The upload timed out after 30 minutes. Check the asset list before retrying; this upload session does not support automatic resume."));
      request.onabort = () => reject(new Error("The upload was interrupted. Check the asset list before starting a new upload; automatic resume is not supported."));
      request.send(file);
    });
  }

  async function uploadFile(kind: SimpleAssetKind, file: File) {
    if (uploading) return;
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({ kind, filename, contentType });
    if (!validation.ok) {
      setStatus(setUploadStage(createUploadSnapshot(file.name, file.size), "failed", validation.message));
      return;
    }
    setUploading(kind);
    setStatus(createUploadSnapshot(file.name, file.size));
    try {
      const signed = await requestAssetUpload({ data: { titleId, kind, filename, contentType } });
      setStatus((current) => current ? setUploadStage(current, "transferring", "Secure upload prepared. Waiting for byte-transfer progress…") : current);
      const uploadUrl = new URL(signed.url);
      uploadUrl.pathname = uploadUrl.pathname.split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
      await putFileWithProgress(uploadUrl.toString(), signed.method, file, contentType);
      setStatus((current) => current ? setUploadStage(current, "verifying", "Bytes sent. Server is checking object size, ETag, and the sealed private copy…") : current);
      const confirmation = await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
      if (confirmation?.verified !== true) throw new Error("The server did not confirm master verification. QC remains locked.");
      setStatus((current) => current ? setUploadStage(current, "refreshing", "Storage verification passed. Refreshing the saved asset record…") : current);
      await onAssetsChanged();
      setStatus((current) => current ? setUploadStage(current, "complete", "Upload and server-side verification completed successfully.") : current);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed unexpectedly.";
      const message = raw.includes("STORAGE_UNAVAILABLE")
        ? "Storage service is unavailable. No verification was recorded; check the asset list before retrying."
        : raw.includes("NetworkError") || raw.includes("Failed to fetch")
          ? "Network or CORS error. Verification did not complete. Check the asset list before starting a new upload; resume is not supported."
          : raw;
      setStatus((current) => current ? setUploadStage(current, "failed", message) : current);
    } finally {
      setUploading(null);
    }
  }

  async function download(id: string) {
    const signed = await requestAssetDownload({ data: { assetId: id } });
    window.location.assign(signed.url);
  }
  const cards: [SimpleAssetKind, string, string][] = [
    ["master", "Main Film", "Required"],
    ["screener", "Trailer", "Add"],
    ["poster_vertical", "Vertical Poster", "Add"],
    ["poster_horizontal", "Horizontal Artwork", "Add"],
    ["thumbnail", "Thumbnail", "Add"],
    ["subtitle", "Subtitle", "Optional"],
    ["censor_certificate", "Censor Certificate", "Optional"],
  ];
  const active = status && !["complete", "failed"].includes(status.stage);
  const percent = status?.total && status.total > 0 ? Math.min(100, Math.round((status.loaded / status.total) * 100)) : null;
  const stageLabel: Record<MasterUploadSnapshot["stage"], string> = {
    preparing: "1 · Preparing secure upload",
    transferring: "2 · Transferring file bytes",
    stalled: "2 · Transfer may be stalled",
    verifying: "3 · Server-side verification",
    refreshing: "4 · Refreshing verified asset",
    complete: "Verified completion",
    failed: "Upload failed — verification not confirmed",
  };
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Media</p>
          <h2 className="mt-1 font-display text-xl font-semibold">OTT package</h2>
        </div>
        <span className="text-xs text-muted">Ready / Missing</span>
      </div>
      {status ? (
        <section aria-labelledby="master-upload-status-title" aria-live="polite" className="mt-5 rounded-2xl border-2 border-accent/40 bg-elevated/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Central upload status</p>
              <h3 id="master-upload-status-title" className="mt-1 text-base font-semibold">{status.filename}</h3>
              <p className="mt-1 text-sm text-muted">{formatUploadBytes(status.fileSize)} total file size</p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{stageLabel[status.stage]}</span>
          </div>
          {status.stage === "transferring" || status.stage === "stalled" || status.stage === "verifying" || status.stage === "refreshing" || status.stage === "complete" ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Browser-reported transfer</span>
                <strong>{percent == null ? `${formatUploadBytes(status.loaded)} sent` : `${percent}% · ${formatUploadBytes(status.loaded)} / ${formatUploadBytes(status.total ?? status.fileSize)}`}</strong>
              </div>
              <div role="progressbar" aria-label="File byte transfer progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent == null ? `${formatUploadBytes(status.loaded)} sent; total transfer size unavailable` : `${percent} percent transferred`} className="mt-2 h-3 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent ?? 0}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                <span>Speed: {status.bytesPerSecond != null ? `${formatUploadBytes(status.bytesPerSecond)}/s` : "Not enough recent data"}</span>
                <span>ETA: {status.etaSeconds != null && Number.isFinite(status.etaSeconds) ? `${Math.ceil(status.etaSeconds)} sec` : "Unavailable"}</span>
              </div>
            </div>
          ) : null}
          <p role="status" aria-live="polite" className="mt-3 break-words text-sm">{status.message}</p>
          {status.stage === "transferring" ? <p className="mt-1 text-xs text-muted">Transfer percentage describes bytes sent by this browser only. It is not storage verification.</p> : null}
          {status.stage === "stalled" ? <p className="mt-1 text-xs text-muted">Wait for the request to resolve or fail. Automatic resume is not supported, so a duplicate upload is not started.</p> : null}
          {status.stage === "failed" ? <p className="mt-1 text-xs text-muted">Safe next step: refresh/check the asset list first. Start a new upload only after confirming no verified asset exists; this upload session cannot resume.</p> : null}
        </section>
      ) : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {cards.map(([kind, label, empty]) => (
          <FileTypeCard
            key={kind}
            kind={kind}
            label={label}
            status={assets.some((a) => (a.kind === kind || (kind === "poster_vertical" && a.kind === "poster")) && a.verified) ? "Ready" : empty}
            busy={uploading === kind}
            canUpload={canUpload && !uploading}
            onFile={(file) => void uploadFile(kind, file)}
          />
        ))}
      </div>
      <div className="mt-5 space-y-2">
        {assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
            <div>
              <p className="text-sm font-semibold">{a.kind}</p>
              <p className="text-xs text-muted">{a.verified ? "Ready — server verified" : "Not verified"}</p>
            </div>
            {a.verified ? <button onClick={() => void download(a.id)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Download</button> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
function FileTypeCard({
  kind,
  label,
  status,
  busy,
  onFile,
  canUpload,
}: {
  canUpload: boolean;
  kind: SimpleAssetKind;
  label: string;
  status: string;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const spec = OTT_INGEST_SPEC[kind];
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-muted">{status}</p>
          <p className="mt-2 text-[11px] leading-5 text-muted">
            Allowed: {spec.extensions.map((ext) => ext.replace(".", "").toUpperCase()).join(", ")}
          </p>
        </div>
        <label className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
          {busy ? "Uploading…" : status === "Ready" ? "Replace" : "Upload"}
          <input
            className="sr-only"
            type="file"
            accept={getOttIngestAccept(kind)}
            disabled={busy || !canUpload}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) onFile(file);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
