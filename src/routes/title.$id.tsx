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
import { AdminPreviewModal } from "@/components/bridge/admin-preview-modal";
import { ProceedToQcModal } from "@/components/bridge/proceed-to-qc-modal";
import { ArchiveTitleModal } from "@/components/bridge/archive-title-modal";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import {
  confirmAssetUpload,
  deleteTitleAsset,
  requestAssetPartUpload,
  commitAssetMultipartUpload,
  abortAssetMultipartUpload,
  listTitleAssets,
  requestAssetDownload,
  requestAssetPreview,
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
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [posterPreviewFailed, setPosterPreviewFailed] = useState(false);
  const [isAdminPreviewOpen, setIsAdminPreviewOpen] = useState(false);
  const [isProceedQcOpen, setIsProceedQcOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

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
  const visibleCards = assetsQ.data?.visibleCards ?? [
    "master",
    "screener",
    "poster_vertical",
    "poster_horizontal",
    "thumbnail",
    "subtitle",
    "censor_certificate",
  ];
  const pub = pubQ.data?.publication;

  useEffect(() => {
    let cancelled = false;
    const poster = assets.find(
      (asset) =>
        asset.verified &&
        ["poster_vertical", "poster"].includes(asset.kind) &&
        Boolean(asset.contentType?.startsWith("image/")) &&
        (asset.permissions ? asset.permissions.canPreview : true),
    );
    setPosterPreviewUrl(null);
    setPosterPreviewFailed(false);
    if (!poster) return () => { cancelled = true; };

    void requestAssetPreview({ data: { assetId: poster.id } })
      .then((res) => {
        if (!cancelled) setPosterPreviewUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) setPosterPreviewFailed(true);
      });

    return () => { cancelled = true; };
  }, [assetsQ.data?.assets]);

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
            {posterPreviewUrl && !posterPreviewFailed ? (
              <img
                src={posterPreviewUrl}
                alt={`Vertical poster for ${title.name}`}
                className="h-full w-full object-contain"
                onError={() => setPosterPreviewFailed(true)}
              />
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">
                {assets.some((asset) => ["poster_vertical", "poster"].includes(asset.kind) && asset.verified)
                  ? "Poster is verified, but its preview could not be loaded."
                  : "Add vertical poster"}
              </div>
            )}
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
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("Files")}
                className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg"
              >
                Upload Files
              </button>

              {actor.internalRole ? (
                <button
                  type="button"
                  onClick={() => setIsAdminPreviewOpen(true)}
                  className="rounded-full border border-line bg-elevated px-4 py-2.5 text-sm font-semibold text-fg hover:border-line-strong hover:bg-surface"
                >
                  Admin Preview
                </button>
              ) : null}

              {title.status === "PREPARING" &&
              canOperateOnTitle(actor, title, "title.advance_upload", "title.ingest_internal") ? (
                <button
                  type="button"
                  onClick={() => setIsProceedQcOpen(true)}
                  className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/20"
                >
                  Proceed to QC
                </button>
              ) : null}

              {(actor.internalRole === "super_admin" || actor.internalRole === "admin") &&
              !["LIVE_FOR_BUYERS", "LICENSED", "DELIVERED"].includes(title.status) ? (
                <button
                  type="button"
                  onClick={() => setIsArchiveOpen(true)}
                  className="rounded-full border border-line px-4 py-2.5 text-sm font-medium text-muted hover:border-red-400/40 hover:text-red-400"
                >
                  Archive Title
                </button>
              ) : null}
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
          visibleCards={visibleCards}
          onAssetsChanged={() => assetsQ.refetch()}
        />
      ) : null}

      {isAdminPreviewOpen ? (
        <AdminPreviewModal
          titleId={id}
          isOpen={isAdminPreviewOpen}
          onClose={() => setIsAdminPreviewOpen(false)}
        />
      ) : null}
      {isProceedQcOpen ? (
        <ProceedToQcModal
          titleId={id}
          titleName={title.name}
          actor={actor}
          onClose={() => setIsProceedQcOpen(false)}
        />
      ) : null}
      {isArchiveOpen ? (
        <ArchiveTitleModal
          titleId={id}
          titleName={title.name}
          currentStatus={title.status}
          onClose={() => setIsArchiveOpen(false)}
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

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "—";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

type SimpleAssetKind =
  | "master"
  | "poster_vertical"
  | "poster_horizontal"
  | "thumbnail"
  | "subtitle"
  | "screener"
  | "censor_certificate";

type UploadQueueItem = {
  id: string;
  kind: SimpleAssetKind;
  file: File;
  progress: number;
  status: "Queued" | "Uploading" | "Completed" | "Failed" | "Cancelled";
  message?: string;
};

function FilesPanel({
  titleId,
  assets,
  visibleCards,
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
    createdAt?: string;
    permissions?: {
      canView: boolean;
      canPreview: boolean;
      canDownload: boolean;
      canUpload: boolean;
      canReplace: boolean;
      canDelete: boolean;
    };
  }>;
  visibleCards: string[];
  onAssetsChanged: () => Promise<unknown> | unknown;
}) {
  const [uploading, setUploading] = useState<SimpleAssetKind | null>(null);
  const activeUploads = useRef<Set<SimpleAssetKind>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const [activePreview, setActivePreview] = useState<{
    id: string;
    kind: string;
    url: string;
    contentType: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

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
    replaceQueue(queueRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateProgress(value: number) {
    if (currentQueueIdRef.current) updateQueueItem(currentQueueIdRef.current, { progress: value });
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
    if (active.assetId && active.uploadId) {
      await abortAssetMultipartUpload({ data: { assetId: active.assetId, uploadId: active.uploadId } }).catch(() => undefined);
    }
    setMessage("Upload cancelled. Incomplete OCI parts were asked to abort; you can select the file again to retry.");
    setUploading(null);
    if (currentQueueIdRef.current) updateQueueItem(currentQueueIdRef.current, { status: "Cancelled", message: "Cancelled by user" });
    activeUploadRef.current = null;
  }

  async function uploadFile(kind: SimpleAssetKind, file: File) {
    if (activeUploads.current.size > 0) return false;
    activeUploads.current.add(kind);
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({ kind, filename, contentType });
    if (!validation.ok) {
      activeUploads.current.delete(kind);
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
              const partRequest = await requestAssetPartUpload({
                data: { assetId: multipart.assetId, uploadId: multipart.uploadId, partNum: index + 1, byteSize: chunk.size, sha256 },
              });
              etags[index] = await uploadPart(
                partRequest.url,
                chunk,
                (loaded) => {
                  loadedByPart[index] = Math.min(loaded, chunk.size);
                  const total = loadedByPart.reduce((sum, value) => sum + value, 0);
                  updateProgress(Math.min(99, Math.floor((total / file.size) * 100)));
                },
                active.xhrs,
                partRequest.headers,
              );
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
      await commitAssetMultipartUpload({
        data: { assetId: multipart.assetId, uploadId: multipart.uploadId, parts: etags.map((etag, index) => ({ partNum: index + 1, etag })) },
      });
      await confirmAssetUpload({ data: { assetId: multipart.assetId, expectedByteSize: file.size } });
      updateProgress(100);
      await onAssetsChanged();
      setMessage(`${kind[0].toUpperCase() + kind.slice(1)} uploaded and verified.`);
      return true;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed";
      if (active.cancelled || (error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Upload cancelled. Select the file again to retry.");
      } else {
        if (active.assetId && active.uploadId) {
          await abortAssetMultipartUpload({ data: { assetId: active.assetId, uploadId: active.uploadId } }).catch(() => undefined);
        }
        setMessage(
          raw.includes("STORAGE_UNAVAILABLE")
            ? "Storage service is currently unavailable. Please try again later."
            : `${raw}. Select the file again to retry.`,
        );
      }
      return false;
    } finally {
      if (activeUploadRef.current === active) activeUploadRef.current = null;
      activeUploads.current.delete(kind);
      setUploading(null);
    }
  }

  function enqueueFiles(kind: SimpleAssetKind, files: File[]) {
    const added = files.map((file) => ({
      id: crypto.randomUUID(),
      kind,
      file,
      progress: 0,
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
            message: ok ? "Uploaded and verified" : message || "Upload failed; select the file again to retry",
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
    ? Math.floor(
        (queueItems.reduce((total, item) => total + (item.file.size * item.progress) / 100, 0) /
          Math.max(1, queueItems.reduce((total, item) => total + item.file.size, 0))) *
          100,
      )
    : 0;

  async function handlePreview(asset: { id: string; kind: string; contentType: string | null }) {
    setPreviewLoading(asset.id);
    setPreviewError(null);
    try {
      const res = await requestAssetPreview({ data: { assetId: asset.id } });
      setActivePreview({
        id: asset.id,
        kind: asset.kind,
        url: res.url,
        contentType: res.contentType ?? asset.contentType,
      });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Preview request failed");
    } finally {
      setPreviewLoading(null);
    }
  }

  async function handleDownload(assetId: string) {
    setPreviewError(null);
    try {
      const signed = await requestAssetDownload({ data: { assetId } });
      window.location.assign(signed.url);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Download request failed");
    }
  }

  async function handleDelete(assetId: string) {
    if (!window.confirm("Are you sure you want to remove this asset?")) return;
    setActionPending(assetId);
    setPreviewError(null);
    try {
      await deleteTitleAsset({ data: { assetId } });
      if (activePreview?.id === assetId) setActivePreview(null);
      await onAssetsChanged();
      setMessage("Asset deleted successfully.");
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Delete request failed");
    } finally {
      setActionPending(null);
    }
  }

  const allCards: [SimpleAssetKind, string, string][] = [
    ["master", "Main Film", "Required"],
    ["screener", "Trailer", "Add"],
    ["poster_vertical", "Vertical Poster", "Add"],
    ["poster_horizontal", "Horizontal Artwork", "Add"],
    ["thumbnail", "Thumbnail", "Add"],
    ["subtitle", "Subtitle", "Optional"],
    ["censor_certificate", "Censor Certificate", "Optional"],
  ];
  const cards = allCards.filter(([kind]) => visibleCards.includes(kind));

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Media</p>
          <h2 className="mt-1 font-display text-xl font-semibold">OTT package</h2>
        </div>
        <span className="text-xs text-muted">Ready / Missing</span>
      </div>

      {cards.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {cards.map(([kind, label, empty]) => {
            const existingAsset = assets.find(
              (a) => (a.kind === kind || (kind === "poster_vertical" && a.kind === "poster")) && a.verified,
            );
            const isReady = Boolean(existingAsset);
            const canUploadCard = canUpload && (isReady ? (existingAsset?.permissions?.canReplace ?? true) : true);

            return (
              <FileTypeCard
                key={kind}
                kind={kind}
                label={label}
                status={isReady ? "Ready" : empty}
                busy={uploading === kind}
                canUpload={canUploadCard}
                onFiles={(files) => enqueueFiles(kind, files)}
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-line bg-elevated/20 p-6 text-center text-xs text-muted">
          No upload actions available for your current role or workflow status.
        </div>
      )}

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
                    <p className="text-xs text-muted">
                      {item.kind} · {(item.file.size / (1024 * 1024)).toFixed(1)} MB · {item.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted">{item.progress}%</span>
                    {["Failed", "Cancelled"].includes(item.status) ? (
                      <button
                        type="button"
                        onClick={() => retryQueueItem(item.id)}
                        className="rounded-full border border-line px-3 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Retry
                      </button>
                    ) : null}
                    {item.status === "Queued" ? (
                      <button
                        type="button"
                        onClick={() => cancelQueuedItem(item.id)}
                        className="rounded-full border border-line px-3 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <progress className="mt-2 h-2 w-full" max={100} value={item.progress} aria-label={`${item.file.name} upload progress`} />
                {item.message ? <p className="mt-1 text-xs text-muted" role="status">{item.message}</p> : null}
              </div>
            ))}
          </div>
          {uploading ? (
            <button
              type="button"
              onClick={() => void cancelUpload()}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Cancel current upload
            </button>
          ) : null}
        </section>
      ) : null}

      {message ? <p className="mt-3 text-xs text-muted" role="status">{message}</p> : null}
      {previewError ? <p role="alert" className="mt-3 text-xs text-red-400">{previewError}</p> : null}

      {/* Active Secure Inline Preview Container */}
      {activePreview ? (
        <div className="mt-5 rounded-2xl border border-accent/40 bg-surface/90 p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Secure Preview
              </span>
              <h3 className="text-sm font-semibold capitalize text-fg">
                {activePreview.kind.replace("_", " ")}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActivePreview(null)}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:bg-elevated hover:text-fg"
            >
              Close ✕
            </button>
          </div>
          <div className="mt-4 flex items-center justify-center">
            {activePreview.kind === "master" ||
            activePreview.kind === "screener" ||
            activePreview.contentType?.startsWith("video/") ? (
              <video
                controls
                playsInline
                className="max-h-[400px] w-full rounded-xl bg-black object-contain shadow-md"
                src={activePreview.url}
              />
            ) : activePreview.kind.includes("poster") ||
              activePreview.kind === "thumbnail" ||
              activePreview.contentType?.startsWith("image/") ? (
              <img
                src={activePreview.url}
                alt={activePreview.kind}
                className="max-h-[400px] rounded-xl object-contain shadow-md"
              />
            ) : activePreview.kind === "censor_certificate" ? (
              <div className="w-full space-y-2">
                <iframe
                  src={activePreview.url}
                  title="Censor Certificate Preview"
                  className="h-[380px] w-full rounded-xl border border-line bg-white"
                />
                <div className="text-right">
                  <a
                    href={activePreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent underline"
                  >
                    Open Certificate in New Tab ↗
                  </a>
                </div>
              </div>
            ) : activePreview.kind === "subtitle" ? (
              <div className="w-full rounded-xl border border-line bg-elevated/40 p-4">
                <p className="text-xs text-muted">
                  Subtitle file verified. Stream authorized for review:
                </p>
                <a
                  href={activePreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-elevated"
                >
                  Inspect Raw Subtitle ↗
                </a>
              </div>
            ) : (
              <div className="rounded-xl border border-line p-4 text-center text-xs text-muted">
                Preview loaded.
                <a
                  href={activePreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-accent underline"
                >
                  View File ↗
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Authoritative Files ({assets.length})
        </h3>
        {assets.length === 0 ? (
          <p className="mt-3 text-xs text-muted">No files accessible for this role.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {assets.map((a) => {
              const canPrev = a.permissions ? a.permissions.canPreview : true;
              const canDown = a.permissions ? a.permissions.canDownload : true;
              const canDel = a.permissions ? a.permissions.canDelete : false;

              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold capitalize text-fg">
                        {a.kind.replace("_", " ")}
                      </p>
                      <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-muted">
                        {a.verified ? "Ready" : "Processing"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatBytes(a.byteSize)}
                      {a.contentType ? ` · ${a.contentType}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canPrev && a.verified ? (
                      <button
                        type="button"
                        onClick={() => void handlePreview(a)}
                        disabled={previewLoading === a.id}
                        className="rounded-full border border-line bg-elevated/60 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated"
                      >
                        {previewLoading === a.id ? "Loading…" : "Preview"}
                      </button>
                    ) : null}
                    {canDown && a.verified ? (
                      <button
                        type="button"
                        onClick={() => void handleDownload(a.id)}
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated"
                      >
                        Download
                      </button>
                    ) : null}
                    {canDel && canUpload ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(a.id)}
                        disabled={actionPending === a.id}
                        className="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                      >
                        {actionPending === a.id ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
        <label className={`cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold ${!canUpload ? "opacity-50 pointer-events-none" : ""}`}>
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
