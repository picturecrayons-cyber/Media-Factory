import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { getTitleWorkflow } from "@/lib/bridge/workflow";
import { WorkflowDesk } from "@/components/bridge/workflow-desk";
import { publicationIsActive } from "@/lib/bridge/workflow-policy";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle, updateTitle } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import {
  abortAssetMultipartUpload,
  completeAssetMultipartUpload,
  confirmAssetUpload,
  finalizeAssetMultipartUpload,
  listTitleAssets,
  recordAssetMultipartPart,
  requestAssetDownload,
  requestAssetMultipartUpload,
  requestAssetUpload,
  resumeAssetMultipartUpload,
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
    queryFn: () => getTitle({ data: { id, includeEvents: false } }),
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [canCancelUpload, setCanCancelUpload] = useState(false);
  const activeXhr = useRef<XMLHttpRequest | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const cancelRequested = useRef(false);
  const MULTIPART_THRESHOLD = 100 * 1024 * 1024;

  function uploadPart(url: string, chunk: Blob, onProgress: (loaded: number) => void) {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhr.current = xhr;
      xhr.open("PUT", url);
      xhr.setRequestHeader("content-type", "application/octet-stream");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
      xhr.onload = () => {
        activeXhr.current = null;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Part upload failed (${xhr.status})`));
          return;
        }
        const etag = xhr.getResponseHeader("etag")?.replaceAll('"', "");
        if (!etag) {
          reject(new Error("Upload part succeeded but ETag was not readable. Check OCI CORS expose-headers for ETag."));
          return;
        }
        resolve(etag);
      };
      xhr.onerror = () => {
        activeXhr.current = null;
        reject(new Error("Browser could not complete the upload request (status 0). Check OCI bucket CORS, network access, and session expiry."));
      };
      xhr.onabort = () => {
        activeXhr.current = null;
        reject(new Error("Upload cancelled"));
      };
      xhr.send(chunk);
    });
  }

  async function cancelUpload() {
    cancelRequested.current = true;
    activeXhr.current?.abort();
    const sessionId = activeSessionId.current;
    if (sessionId) {
      try {
        await abortAssetMultipartUpload({ data: { sessionId } });
      } catch (error) {
        setMessage(error instanceof Error ? `Cancel requested; cleanup needs retry: ${error.message}` : "Cancel requested; upload cleanup needs retry.");
      }
    }
    if (typeof window !== "undefined") window.localStorage.removeItem(`bridge-upload:${titleId}`);
    activeSessionId.current = null;
    setMessage("Upload cancelled. Incomplete multipart parts were scheduled for cleanup.");
  }

  async function uploadFile(kind: SimpleAssetKind, file: File) {
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({ kind, filename, contentType });
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }
    setUploading(kind);
    setUploadProgress(0);
    setCanCancelUpload(false);
    cancelRequested.current = false;
    setMessage(`Preparing ${kind} upload…`);
    try {
      if (file.size < MULTIPART_THRESHOLD) {
        const savedSession = window.localStorage.getItem(`bridge-upload:${titleId}`);
        if (savedSession) {
          try {
            const previous = JSON.parse(savedSession) as { sessionId?: string };
            if (previous.sessionId) await abortAssetMultipartUpload({ data: { sessionId: previous.sessionId } });
          } catch { /* stale sessions are cleaned up by expiry recovery */ }
          window.localStorage.removeItem(`bridge-upload:${titleId}`);
        }
        const signed = await requestAssetUpload({
          data: { titleId, kind, filename, contentType },
        });
        const uploadUrl = new URL(signed.url);
        uploadUrl.pathname = uploadUrl.pathname.split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
        const put = await fetch(uploadUrl.toString(), {
          method: signed.method,
          body: file,
          headers: { "content-type": contentType },
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
        await onAssetsChanged();
        setUploadProgress(100);
        setMessage(`${kind[0].toUpperCase() + kind.slice(1)} is ready.`);
        return;
      }

      const storageKey = `bridge-upload:${titleId}`;
      const fingerprint = { titleId, kind, filename, fileSize: file.size, lastModified: file.lastModified };
      let session: Awaited<ReturnType<typeof resumeAssetMultipartUpload>> | Awaited<ReturnType<typeof requestAssetMultipartUpload>> | null = null;
      let previous: { sessionId?: string; kind?: string; filename?: string; fileSize?: number; lastModified?: number } | null = null;
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) previous = JSON.parse(saved);
      } catch {
        previous = null;
      }

      const matches = previous?.sessionId && previous.kind === kind &&
        previous.filename === filename && previous.fileSize === file.size &&
        previous.lastModified === file.lastModified;
      if (matches && previous?.sessionId) {
        try {
          session = await resumeAssetMultipartUpload({ data: { sessionId: previous.sessionId } });
        } catch {
          window.localStorage.removeItem(storageKey);
          session = null;
        }
      } else if (previous?.sessionId) {
        try { await abortAssetMultipartUpload({ data: { sessionId: previous.sessionId } }); } catch { /* stale session cleanup is best effort */ }
        window.localStorage.removeItem(storageKey);
      }

      if (!session) {
        session = await requestAssetMultipartUpload({
          data: { titleId, kind, filename, contentType, fileSize: file.size },
        });
        window.localStorage.setItem(storageKey, JSON.stringify({ ...fingerprint, sessionId: session.sessionId }));
      }
      activeSessionId.current = session.sessionId;
      setCanCancelUpload(session.status === "ACTIVE");

      if (session.status === "COMMITTED" || session.status === "COMPLETED") {
        await confirmAssetUpload({ data: { assetId: session.assetId, expectedByteSize: file.size } });
        await completeAssetMultipartUpload({ data: { sessionId: session.sessionId } });
        window.localStorage.removeItem(storageKey);
        await onAssetsChanged();
        setUploadProgress(100);
        setMessage(`${kind[0].toUpperCase() + kind.slice(1)} is ready.`);
        return;
      }
      if (!session.uploadUrl) throw new Error("Upload session has no active upload URL. Restart the upload.");

      const existingParts = new Map(session.parts.map((part) => [part.partNumber, part]));
      let completedBytes = session.parts.reduce((sum, part) => sum + part.byteSize, 0);
      const totalParts = Math.ceil(file.size / session.partSize);
      for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
        if (cancelRequested.current) throw new Error("Upload cancelled");
        const start = (partNumber - 1) * session.partSize;
        const end = Math.min(file.size, start + session.partSize);
        const chunk = file.slice(start, end);
        const existing = existingParts.get(partNumber);
        if (existing && existing.byteSize === chunk.size && existing.etag) continue;

        let etag = "";
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            etag = await uploadPart(`${session.uploadUrl}${partNumber}`, chunk, (loaded) => {
              const totalLoaded = Math.min(file.size, completedBytes + loaded);
              setUploadProgress(Math.floor((totalLoaded / file.size) * 100));
              setMessage(`Uploading ${kind}: ${Math.round(totalLoaded / 1024 / 1024)} MB of ${Math.ceil(file.size / 1024 / 1024)} MB (part ${partNumber}/${totalParts})…`);
            });
            break;
          } catch (error) {
            lastError = error;
            if (cancelRequested.current || attempt === 3) throw error;
            setMessage(`Retrying part ${partNumber} (attempt ${attempt + 1}/3)…`);
            await new Promise((resolve) => setTimeout(resolve, attempt * 800));
          }
        }
        if (!etag) throw lastError instanceof Error ? lastError : new Error("Part upload failed");
        await recordAssetMultipartPart({
          data: { sessionId: session.sessionId, partNumber, etag, byteSize: chunk.size },
        });
        completedBytes += chunk.size;
        setUploadProgress(Math.floor((completedBytes / file.size) * 100));
      }

      const finalized = await finalizeAssetMultipartUpload({ data: { sessionId: session.sessionId } });
      await confirmAssetUpload({ data: { assetId: finalized.assetId, expectedByteSize: finalized.expectedByteSize } });
      await completeAssetMultipartUpload({ data: { sessionId: session.sessionId } });
      window.localStorage.removeItem(storageKey);
      activeSessionId.current = null;
      await onAssetsChanged();
      setUploadProgress(100);
      setMessage(`${kind[0].toUpperCase() + kind.slice(1)} is ready and verified.`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed";
      setMessage(cancelRequested.current ? "Upload cancelled." : raw.includes("STORAGE_UNAVAILABLE")
        ? "Storage service is currently unavailable. Please try again later."
        : raw);
    } finally {
      activeXhr.current = null;
      activeSessionId.current = null;
      setCanCancelUpload(false);
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
            progress={uploading === kind ? uploadProgress : 0}
            canCancel={uploading === kind && canCancelUpload}
            canUpload={canUpload}
            onCancel={() => void cancelUpload()}
            onFile={(file) => void uploadFile(kind, file)}
          />
        ))}
      </div>
      {message ? <p className="mt-3 text-xs text-muted">{message}</p> : null}
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
function FileTypeCard({
  kind,
  label,
  status,
  busy,
  progress,
  canCancel,
  onCancel,
  onFile,
  canUpload,
}: {
  canUpload: boolean;
  kind: SimpleAssetKind;
  label: string;
  status: string;
  busy: boolean;
  progress: number;
  canCancel: boolean;
  onCancel: () => void;
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
          {busy ? `Uploading ${progress}%…` : status === "Ready" ? "Replace" : "Upload"}
          <input
            className="sr-only"
            id={`asset-upload-${kind}`}
            name={`asset-${kind}`}
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
        {canCancel ? <button type="button" onClick={onCancel} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Cancel</button> : null}
      </div>
      {busy ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-label={`${label} upload progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-accent-strong transition-[width]" style={{ width: `${progress}%` }} /></div> : null}
    </div>
  );
}
