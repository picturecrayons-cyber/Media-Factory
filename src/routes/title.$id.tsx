import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { getTitleWorkflow } from "@/lib/bridge/workflow";
import { WorkflowDesk } from "@/components/bridge/workflow-desk";
import { publicationIsActive } from "@/lib/bridge/workflow-policy";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle, updateTitle } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import {
  confirmAssetUpload,
  requestAssetPartUpload,
  commitAssetMultipartUpload,
  abortAssetMultipartUpload,
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
import { assertMultipartEtags, multipartPartCount } from "@/lib/bridge/multipart-upload";

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
            canOperateOnTitle(actor, title, "asset.sign_upload", "asset.sign_upload") &&
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const tier = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** tier).toFixed(tier === 0 ? 0 : 1)} ${units[tier]}`;
}
function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "Calculating…";
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
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
type UploadQueueItem = {
  id: string;
  kind: SimpleAssetKind;
  file: File;
  progress: number;
  status: "Queued" | "Uploading" | "Completed" | "Failed" | "Cancelled";
  message?: string;
  loadedBytes?: number;
  startedAt?: number;
  elapsedSeconds?: number;
  remainingSeconds?: number | null;
  samples?: number[];
};
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
  const [queueItems, setQueueItems] = useState<UploadQueueItem[]>([]);
  const queueRef = useRef<UploadQueueItem[]>([]);
  const queueRunningRef = useRef(false);
  const currentQueueIdRef = useRef<string | null>(null);
  const activeUploadRef = useRef<{ xhrs: XMLHttpRequest[]; assetId?: string; uploadId?: string; cancelled: boolean } | null>(null);

  function replaceQueue(items: UploadQueueItem[]) {
    queueRef.current = items;
    setQueueItems(items);
  }

  function updateQueueItem(id: string, patch: Partial<UploadQueueItem>) {
    replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function updateProgress(value: number, loadedBytes?: number) {
    const id = currentQueueIdRef.current;
    if (!id) return;
    const current = queueRef.current.find((item) => item.id === id);
    if (!current) return;
    const now = Date.now();
    const startedAt = current.startedAt ?? now;
    const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
    const loaded = Math.min(current.file.size, loadedBytes ?? current.file.size * value / 100);
    const bytesPerSecond = elapsedSeconds > 0 ? loaded / elapsedSeconds : 0;
    const remainingSeconds = bytesPerSecond > 0 ? Math.max(0, Math.ceil((current.file.size - loaded) / bytesPerSecond)) : null;
    updateQueueItem(id, {
      progress: value,
      loadedBytes: loaded,
      startedAt,
      elapsedSeconds,
      remainingSeconds,
      samples: [...(current.samples ?? []), value].slice(-24),
    });
  }

  function uploadPart(
    url: string,
    body: Blob,
    onProgress: (loaded: number) => void,
    xhrs: XMLHttpRequest[],
    headers: Record<string, string>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrs.push(xhr);
      xhr.open("PUT", url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Part upload failed (${xhr.status})`));
          return;
        }
        const etag = xhr.getResponseHeader("etag")?.trim();
        if (!etag) {
          reject(new Error("OCI did not expose the part ETag. Check the bucket CORS expose-headers configuration before retrying."));
          return;
        }
        resolve(etag);
      };
      xhr.onerror = () => reject(new Error("Network error while uploading a part"));
      xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
      xhr.send(body);
    });
  }

  async function cancelUpload() {
    const active = activeUploadRef.current;
    if (!active) return;
    active.cancelled = true;
    for (const xhr of active.xhrs) xhr.abort();
    if (active.assetId && active.uploadId) await abortAssetMultipartUpload({ data: { assetId: active.assetId, uploadId: active.uploadId } }).catch(() => undefined);
    setMessage("Upload cancelled. Incomplete OCI parts were asked to abort; you can select the file again to retry.");
    setUploading(null);
    if (currentQueueIdRef.current) updateQueueItem(currentQueueIdRef.current, { status: "Cancelled", message: "Cancelled by user" });
    activeUploadRef.current = null;
  }

  async function uploadFile(kind: SimpleAssetKind, file: File) {
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({ kind, filename, contentType });
    if (!validation.ok) {
      setMessage(validation.message);
      return false;
    }
    if (activeUploadRef.current) return false;
    const active = { xhrs: [] as XMLHttpRequest[], assetId: undefined as string | undefined, uploadId: undefined as string | undefined, cancelled: false };
    activeUploadRef.current = active;
    setUploading(kind);
    updateProgress(0);
    setMessage(`Preparing secure multipart upload for ${kind}…`);
    try {
      const multipart = await requestAssetUpload({
        data: { titleId, kind, filename, contentType },
      });
      active.assetId = multipart.assetId;
      active.uploadId = multipart.uploadId;
      if (active.cancelled) {
        await abortAssetMultipartUpload({ data: { assetId: multipart.assetId, uploadId: multipart.uploadId } }).catch(() => undefined);
        throw new DOMException("Upload cancelled", "AbortError");
      }
      const chunkSize = 16 * 1024 * 1024;
      const partCount = multipartPartCount(file.size, chunkSize);
      const loadedByPart = new Array<number>(partCount).fill(0);
      const etags = new Array<string>(partCount);
      let nextPart = 0;
      let firstError: unknown = null;
      const worker = async () => {
        while (!active.cancelled && !firstError) {
          const index = nextPart++;
          if (index >= partCount) return;
          const start = index * chunkSize;
          const chunk = file.slice(start, Math.min(file.size, start + chunkSize));
          let lastError: unknown = null;
          for (let attempt = 0; attempt < 3 && !active.cancelled; attempt += 1) {
            try {
              const digest = await crypto.subtle.digest("SHA-256", await chunk.arrayBuffer());
              const sha256 = btoa(String.fromCharCode(...new Uint8Array(digest)));
              const partRequest = await requestAssetPartUpload({ data: { assetId: multipart.assetId, uploadId: multipart.uploadId, partNum: index + 1, byteSize: chunk.size, sha256 } });
              etags[index] = await uploadPart(partRequest.url, chunk, (loaded) => {
                loadedByPart[index] = Math.min(loaded, chunk.size);
                const total = loadedByPart.reduce((sum, value) => sum + value, 0);
                updateProgress(Math.min(99, Math.floor((total / file.size) * 100)), total);
              }, active.xhrs, partRequest.headers);
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              loadedByPart[index] = 0;
              if (active.cancelled) return;
            }
          }
          if (lastError) {
            firstError = lastError;
            return;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, partCount) }, () => worker()));
      if (active.cancelled) throw new DOMException("Upload cancelled", "AbortError");
      if (firstError) throw firstError;
      assertMultipartEtags(etags, partCount);
      setMessage("All parts uploaded. Committing and verifying the object…");
      await commitAssetMultipartUpload({ data: { assetId: multipart.assetId, uploadId: multipart.uploadId, parts: etags.map((etag, index) => ({ partNum: index + 1, etag })) } });
      await confirmAssetUpload({ data: { assetId: multipart.assetId, expectedByteSize: file.size } });
      updateProgress(100, file.size);
      await onAssetsChanged();
      setMessage(`${kind[0].toUpperCase() + kind.slice(1)} uploaded and verified.`);
      return true;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed";
      if (active.cancelled || (error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Upload cancelled. Select the file again to retry.");
      } else {
        if (active.assetId && active.uploadId) await abortAssetMultipartUpload({ data: { assetId: active.assetId, uploadId: active.uploadId } }).catch(() => undefined);
        setMessage(raw.includes("STORAGE_UNAVAILABLE")
          ? "Storage service is currently unavailable. Please try again later."
          : `${raw}. Select the file again to retry.`);
      }
      return false;
    } finally {
      if (activeUploadRef.current === active) activeUploadRef.current = null;
      setUploading(null);
    }
  }

  function enqueueFiles(kind: SimpleAssetKind, files: File[]) {
    const added = files.map((file) => ({
      id: crypto.randomUUID(),
      kind,
      file,
      progress: 0,
      loadedBytes: 0,
      samples: [0],
      status: "Queued" as const,
      message: "Waiting for the next upload slot",
    }));
    replaceQueue([...queueRef.current, ...added]);
    void processQueue();
  }

  function retryQueueItem(id: string) {
    const item = queueRef.current.find((candidate) => candidate.id === id);
    if (!item || !["Failed", "Cancelled"].includes(item.status)) return;
    updateQueueItem(id, { status: "Queued", progress: 0, message: "Retry queued" });
    void processQueue();
  }

  function cancelQueuedItem(id: string) {
    const item = queueRef.current.find((candidate) => candidate.id === id);
    if (!item || item.status !== "Queued") return;
    updateQueueItem(id, { status: "Cancelled", message: "Removed from pending queue" });
  }

  async function processQueue() {
    if (queueRunningRef.current) return;
    queueRunningRef.current = true;
    try {
      while (true) {
        const item = queueRef.current.find((candidate) => candidate.status === "Queued");
        if (!item) break;
        currentQueueIdRef.current = item.id;
        updateQueueItem(item.id, { status: "Uploading", message: "Uploading and verifying…" });
        const ok = await uploadFile(item.kind, item.file);
        const latest = queueRef.current.find((candidate) => candidate.id === item.id);
        if (latest?.status !== "Cancelled") {
          updateQueueItem(item.id, {
            status: ok ? "Completed" : "Failed",
            progress: ok ? 100 : latest?.progress ?? 0,
            message: ok ? "Uploaded and verified" : (message || "Upload failed; select the file again to retry"),
          });
        }
        currentQueueIdRef.current = null;
      }
    } finally {
      queueRunningRef.current = false;
      if (queueRef.current.some((item) => item.status === "Queued")) void processQueue();
    }
  }

  const batchProgress = queueItems.length
    ? Math.floor(queueItems.reduce((total, item) => total + item.file.size * item.progress / 100, 0) /
      Math.max(1, queueItems.reduce((total, item) => total + item.file.size, 0)) * 100)
    : 0;

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
            onFiles={(files) => enqueueFiles(kind, files)}
          />
        ))}
      </div>
      {queueItems.length ? (
        <section className="mt-5 space-y-3" aria-label="Upload queue">
          <div className="flex items-center justify-between gap-3 text-sm">
            <h3 className="font-semibold">Upload queue ({queueItems.length} files)</h3>
            <span className="text-xs text-muted">Overall progress: {batchProgress}%</span>
          </div>
          <progress className="h-2 w-full" max={100} value={batchProgress} aria-label="Overall upload batch progress" />
          <div className="space-y-3">
            {queueItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-semibold">{item.file.name}</p>
                    <p className="text-xs text-muted">{item.kind} · {(item.file.size / (1024 * 1024)).toFixed(1)} MB · {item.status}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted">{item.progress}%</span>
                    {["Failed", "Cancelled"].includes(item.status) ? (
                      <button type="button" onClick={() => retryQueueItem(item.id)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Retry</button>
                    ) : null}
                    {item.status === "Queued" ? (
                      <button type="button" onClick={() => cancelQueuedItem(item.id)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Remove</button>
                    ) : null}
                  </div>
                </div>
                <progress className="mt-2 h-2 w-full" max={100} value={item.progress} aria-label={`${item.file.name} upload progress`} />
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <div><span className="text-muted">Transferred</span><p className="font-semibold tabular-nums">{formatBytes(item.loadedBytes ?? 0)} / {formatBytes(item.file.size)}</p></div>
                  <div><span className="text-muted">Elapsed</span><p className="font-semibold tabular-nums">{formatDuration(item.elapsedSeconds)}</p></div>
                  <div><span className="text-muted">Remaining</span><p className="font-semibold tabular-nums">{item.progress >= 100 ? "Verifying" : formatDuration(item.remainingSeconds)}</p></div>
                  <div><span className="text-muted">Transfer</span><p className="font-semibold">{item.progress >= 100 ? "Verifying" : item.status}</p></div>
                </div>
                <div className="mt-2 flex h-7 items-end gap-1" role="img" aria-label={`${item.file.name} recent upload progress graph`}>
                  {(item.samples ?? [item.progress]).map((sample, index) => <span key={index} title={`${sample}%`} className="min-w-1 flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(8, sample)}%` }} />)}
                </div>
                {item.message ? <p className="mt-1 text-xs text-muted" role="status">{item.message}</p> : null}
              </div>
            ))}
          </div>
          {uploading ? <button type="button" onClick={() => void cancelUpload()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Cancel current upload</button> : null}
        </section>
      ) : null}
      {message ? <p className="mt-3 text-xs text-muted" role="status">{message}</p> : null}
      <div className="mt-5 space-y-2">
        {assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
            <div>
              <p className="text-sm font-semibold">{a.kind}</p>
              <p className="text-xs text-muted">{a.verified ? "Ready" : "Processing"}</p>
            </div>
            {a.verified ? (
              <button onClick={() => void download(a.id)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">
                Download
              </button>
            ) : null}
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
  onFiles,
  canUpload,
}: {
  canUpload: boolean;
  kind: SimpleAssetKind;
  label: string;
  status: string;
  busy: boolean;
  onFiles: (files: File[]) => void;
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
            multiple
            accept={getOttIngestAccept(kind)}
            disabled={busy || !canUpload}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              if (files.length) onFiles(files);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
