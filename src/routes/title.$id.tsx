import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { getTitleWorkflow } from "@/lib/bridge/workflow";
import { WorkflowDesk } from "@/components/bridge/workflow-desk";
import { publicationIsActive } from "@/lib/bridge/workflow-policy";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
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
          <TitlePosterPreview assets={assets} titleName={title.name} />
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
function TitlePosterPreview({
  assets,
  titleName,
}: {
  assets: Array<{ id: string; kind: string; verified: boolean }>;
  titleName: string;
}) {
  const poster = assets.find((asset) => asset.verified && asset.kind === "poster_vertical")
    ?? assets.find((asset) => asset.verified && asset.kind === "poster")
    ?? assets.find((asset) => asset.verified && asset.kind === "thumbnail");
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let current = true;
    setPosterUrl(null);
    setUnavailable(false);
    if (!poster) return () => { current = false; };
    void requestAssetDownload({ data: { assetId: poster.id } })
      .then((signed) => { if (current) setPosterUrl(signed.url); })
      .catch(() => { if (current) setUnavailable(true); });
    return () => { current = false; };
  }, [poster?.id]);

  return (
    <div className="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-elevated">
      {posterUrl ? (
        <img src={posterUrl} alt={`${titleName} poster`} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">
          <div>
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-line text-2xl" aria-hidden="true">▧</div>
            <p className="mt-3 font-semibold text-fg">{titleName}</p>
            <p className="mt-1">{unavailable ? "Artwork preview unavailable" : "Add a vertical poster to identify this title visually"}</p>
          </div>
        </div>
      )}
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
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    kind: SimpleAssetKind;
    loaded: number;
    total: number;
    percent: number;
    elapsedSeconds: number;
    remainingSeconds: number | null;
    samples: number[];
  } | null>(null);
  const activeXhr = useRef<XMLHttpRequest | null>(null);
  async function uploadFile(kind: SimpleAssetKind, file: File) {
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({
      kind,
      filename,
      contentType,
    });
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }
    setUploading(kind);
    setMessage(`Preparing ${kind} upload…`);
    try {
      const signed = await requestAssetUpload({
        data: {
          titleId,
          kind,
          filename,
          contentType,
        },
      });
      const uploadUrl = new URL(signed.url);
      uploadUrl.pathname = uploadUrl.pathname.split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
      const startedAt = Date.now();
      setProgress({
        kind,
        loaded: 0,
        total: file.size,
        percent: 0,
        elapsedSeconds: 0,
        remainingSeconds: null,
        samples: [0],
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeXhr.current = xhr;
        xhr.open(signed.method, uploadUrl.toString());
        xhr.setRequestHeader("content-type", contentType);
        xhr.upload.onprogress = (event) => {
          const loaded = Math.min(event.loaded, file.size);
          const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
          const percent = Math.min(100, Math.round((loaded / Math.max(file.size, 1)) * 100));
          const bytesPerSecond = loaded / elapsedSeconds;
          const remainingSeconds = bytesPerSecond > 0
            ? Math.max(0, Math.ceil((file.size - loaded) / bytesPerSecond))
            : null;
          setProgress((current) => current && current.kind === kind
            ? {
                ...current,
                loaded,
                total: file.size,
                percent,
                elapsedSeconds,
                remainingSeconds,
                samples: [...current.samples, percent].slice(-24),
              }
            : current);
        };
        xhr.onload = () => {
          activeXhr.current = null;
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => {
          activeXhr.current = null;
          reject(new Error("Network error during upload. Retry the upload; the stored object has not been verified."));
        };
        xhr.onabort = () => {
          activeXhr.current = null;
          reject(new Error("Upload cancelled. The object was not marked verified."));
        };
        xhr.send(file);
      });
      setProgress((current) => current ? {
        ...current,
        loaded: file.size,
        total: file.size,
        percent: 100,
        elapsedSeconds: Math.max((Date.now() - startedAt) / 1000, 0.1),
        remainingSeconds: 0,
        samples: [...current.samples, 100].slice(-24),
      } : current);
      setMessage("Upload transferred. Verifying stored bytes and immutable integrity…");
      await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
      await onAssetsChanged();
      setMessage(`${kind[0].toUpperCase() + kind.slice(1)} is ready.`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed";
      setMessage(
        raw.includes("STORAGE_UNAVAILABLE")
          ? "Storage service is currently unavailable. Please try again later."
          : raw,
      );
    } finally {
      activeXhr.current = null;
      setUploading(null);
      setProgress(null);
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
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Media</p>
          <h2 className="mt-1 font-display text-xl font-semibold">OTT package</h2>
        </div>
        <span className="text-xs text-muted">Ready / Missing</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {cards.map(([kind, label, empty]) => (
          <FileTypeCard
            key={kind}
            kind={kind}
            label={label}
            status={assets.some((a) => (a.kind === kind || (kind === "poster_vertical" && a.kind === "poster")) && a.verified) ? "Ready" : empty}
            busy={uploading === kind}
            canUpload={canUpload}
            onFile={(file) => void uploadFile(kind, file)}
          />
        ))}
      </div>
      {progress ? (
        <div className="mt-4 rounded-xl border border-line bg-elevated/50 p-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{progress.kind.replaceAll("_", " ")} upload</p>
            <p className="font-mono text-sm font-semibold tabular-nums">{progress.percent}%</p>
          </div>
          <div
            role="progressbar"
            aria-label="File upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><p className="text-muted">Transferred</p><p className="mt-1 font-semibold tabular-nums">{formatBytes(progress.loaded)} / {formatBytes(progress.total)}</p></div>
            <div><p className="text-muted">Elapsed</p><p className="mt-1 font-semibold tabular-nums">{formatDuration(progress.elapsedSeconds)}</p></div>
            <div><p className="text-muted">Estimated remaining</p><p className="mt-1 font-semibold tabular-nums">{progress.remainingSeconds === null ? "Calculating…" : formatDuration(progress.remainingSeconds)}</p></div>
            <div><p className="text-muted">Stage</p><p className="mt-1 font-semibold">{progress.percent === 100 ? "Verifying" : "Uploading"}</p></div>
          </div>
          <div className="mt-4 flex h-10 items-end gap-1" role="img" aria-label="Recent upload progress graph">
            {progress.samples.map((sample, index) => (
              <span key={index} title={`${sample}%`} className="min-w-1 flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(8, sample)}%` }} />
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => activeXhr.current?.abort()} disabled={!activeXhr.current} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Cancel upload</button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-xs text-muted" role="status">{message}</p> : null}
      <div className="mt-5 space-y-2">
        {assets.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"
          >
            <div>
              <p className="text-sm font-semibold">{a.kind}</p>
              <p className="text-xs text-muted">{a.verified ? "Ready" : "Processing"}</p>
            </div>
            {a.verified ? (
              <button
                onClick={() => void download(a.id)}
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold"
              >
                Download
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const tier = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** tier).toFixed(tier === 0 ? 0 : 1)} ${units[tier]}`;
}
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
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
