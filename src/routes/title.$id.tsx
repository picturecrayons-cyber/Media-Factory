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
  listTitleAssets,
  requestAssetDownload,
  requestAssetUpload,
} from "@/lib/bridge/assets";
import { getLoopPublication } from "@/lib/bridge/loop-publication";
import type { BridgeActor } from "@/lib/bridge/session";
import {
  OTT_INGEST_SPEC,
  getOttIngestAccept,
  validateArtworkDimensions,
  validateOttIngestFile,
} from "@/lib/bridge/ott-ingest-spec";
import { asciiUploadName } from "@/lib/bridge/latin1";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const WORKSPACE_TABS = ["Overview", "Files", "Workflow"] as const;
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
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const poster = assets.find((asset) => asset.verified && ["poster_vertical", "poster"].includes(asset.kind));
    if (!poster) {
      setPosterPreviewUrl(null);
      return;
    }
    let cancelled = false;
    requestAssetDownload({ data: { assetId: poster.id } })
      .then((signed) => {
        if (!cancelled) setPosterPreviewUrl(signed.url);
      })
      .catch(() => {
        if (!cancelled) setPosterPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assets]);

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
      {assetsQ.isError ? <p role="alert">Assets unavailable: {assetsQ.error.message}</p> : null}
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <div className="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-elevated">
            {posterPreviewUrl ? (
              <img
                src={posterPreviewUrl}
                alt={`${title.name} vertical poster preview`}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">
                {assets.some((asset) => asset.verified && ["poster_vertical", "poster"].includes(asset.kind))
                  ? "Poster verified · preview unavailable"
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
                <p className="mt-2 break-all font-mono text-xs text-muted" aria-label="Canonical Bridge Title ID">
                  Bridge Title ID: {title.id}
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
        {(actor.accountType === "buyer" && !actor.internalRole ? (["Overview"] as const) : WORKSPACE_TABS).map((tab) => (
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
      ) : activeTab === "Workflow" ? (
        <WorkflowDesk title={title} actor={actor} />
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
  const uploadLock = useRef(false);
  const activeUploadRequest = useRef<XMLHttpRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifyingAssetId, setVerifyingAssetId] = useState<string | null>(null);
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<{
    kind: SimpleAssetKind;
    loaded: number;
    total: number;
    percent: number | null;
    stage: "preparing" | "uploading" | "verifying" | "complete" | "failed" | "cancelled";
  } | null>(null);

  useEffect(() => {
    if (uploading === null || uploadStartedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - uploadStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [uploading, uploadStartedAt]);
  async function validateArtworkOrientation(kind: SimpleAssetKind, file: File): Promise<string | null> {
    if (kind !== "poster_vertical" && kind !== "poster_horizontal") return null;
    let image: ImageBitmap;
    try {
      image = await createImageBitmap(file);
    } catch {
      return "Could not read image dimensions. Please choose a valid PNG, JPG, or WebP image.";
    }
    const { width, height } = image;
    image.close();
    const result = validateArtworkDimensions(kind, width, height);
    return result.ok ? null : result.message;
  }

  async function uploadFile(kind: SimpleAssetKind, file: File) {
    // Serialize transfers so a shared progress panel and elapsed timer can never be
    // overwritten or cleared by another asset's request.
    if (uploadLock.current) return;
    uploadLock.current = true;
    const orientationError = await validateArtworkOrientation(kind, file);
    if (orientationError) {
      setMessage(orientationError);
      uploadLock.current = false;
      return;
    }
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({
      kind,
      filename,
      contentType,
    });
    if (!validation.ok) {
      setMessage(validation.message);
      uploadLock.current = false;
      return;
    }
    setUploading(kind);
    setUploadStartedAt(Date.now());
    setElapsedSeconds(0);
    setUploadProgress({ kind, loaded: 0, total: file.size, percent: 0, stage: "preparing" });
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
      setMessage(`Uploading ${kind}…`);
      setUploadProgress({ kind, loaded: 0, total: file.size, percent: null, stage: "uploading" });
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        activeUploadRequest.current = request;
        request.open(signed.method, uploadUrl.toString());
        request.setRequestHeader("content-type", contentType);
        request.upload.onprogress = (event) => {
          const total = event.lengthComputable ? event.total : file.size;
          const loaded = Math.min(event.loaded, total);
          setUploadProgress({
            kind,
            loaded,
            total,
            percent: event.lengthComputable && total > 0
              ? Math.min(100, Math.round((loaded / total) * 100))
              : null,
            stage: "uploading",
          });
        };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve();
          else reject(new Error(`Upload failed (${request.status})`));
        };
        request.onerror = () => reject(new Error("Upload connection failed. Check your connection and retry."));
        request.onabort = () => reject(new Error("Upload was cancelled."));
        request.send(file);
      });
      setMessage("Upload sent. Verifying storage…");
      setUploadProgress((current) => current ? { ...current, percent: 100, loaded: file.size, stage: "verifying" } : current);
      const confirmation = await confirmAssetUpload({
        data: { assetId: signed.assetId, expectedByteSize: file.size },
      });
      if (!confirmation.verified) throw new Error("Storage verification did not complete. Please retry verification.");
      await onAssetsChanged();
      setUploadProgress((current) => current ? { ...current, stage: "complete" } : current);
      setMessage(`${kind[0].toUpperCase() + kind.slice(1)} uploaded and storage-verified.`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed";
      const wasCancelled = raw === "Upload was cancelled.";
      setUploadProgress((current) => current ? { ...current, stage: wasCancelled ? "cancelled" : "failed" } : current);
      if (verificationStarted) {
        // The object may exist and the server may still be finishing verification.
        // Refresh and offer retry for the same asset; never re-upload automatically.
        try {
          await onAssetsChanged();
        } catch {
          // Preserve the unresolved state if the refresh also fails.
        }
        setMessage(
          raw === "VERIFICATION_TIMEOUT"
            ? "Storage verification timed out. The upload may already exist; use Retry verification before uploading again."
            : "Storage verification did not return a confirmed result: " + raw + ". The upload may already exist; use Retry verification before uploading again.",
        );
      } else {
        setMessage(
          wasCancelled
            ? "Upload cancelled. You can select the file again to retry."
            : raw.includes("STORAGE_UNAVAILABLE")
              ? "Storage service is currently unavailable. Please try again later."
              : raw,
        );
      }
    } finally {
      activeUploadRequest.current = null;
      setUploading(null);
      setUploadStartedAt(null);
      uploadLock.current = false;
    }
  }
  async function retryVerification(assetId: string) {
    if (uploadLock.current || verifyingAssetId) return;
    setVerifyingAssetId(assetId);
    setMessage("Retrying storage verification…");
    try {
      const result = await confirmAssetUploadWithTimeout({ assetId });
      if (!result.verified) throw new Error("Storage verification is still pending. Retry again shortly.");
      await onAssetsChanged();
      setMessage("Storage verified. The asset is now available in this title workspace.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Verification retry failed: ${error.message}`
          : "Verification retry failed. Check storage connectivity and retry.",
      );
    } finally {
      setVerifyingAssetId(null);
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
            status={
              assets.some((a) => a.kind === kind && a.verified)
                ? "Ready"
                : assets.some((a) => a.kind === kind)
                  ? "Verifying"
                  : empty
            }
            busy={uploading === kind}
            canUpload={canUpload && uploading === null}
            onFile={(file) => void uploadFile(kind, file)}
          />
        ))}
      </div>
      {uploadProgress ? (
        <div className="mt-4 rounded-xl border border-line p-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {uploadProgress.kind === "master" ? "Main Film" : uploadProgress.kind}
            </p>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted">
                {uploadProgress.stage === "preparing" ? "Preparing upload" :
                  uploadProgress.stage === "uploading" ? "Uploading" :
                  uploadProgress.stage === "verifying" ? "Verifying storage" :
                  uploadProgress.stage === "complete" ? "Complete — verified" :
                  uploadProgress.stage === "cancelled" ? "Cancelled" : "Failed"}
              </p>
              {uploadProgress.stage === "uploading" ? (
                <button
                  type="button"
                  onClick={() => activeUploadRequest.current?.abort()}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-fg/5"
                >
                  Cancel Upload
                </button>
              ) : null}
            </div>
          </div>
          {uploadProgress.stage === "uploading" && uploadProgress.percent === null ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          ) : (
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-elevated"
              role="progressbar"
              aria-label={`${uploadProgress.kind} upload progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress.percent ?? 0}
            >
              <div
                className={`h-full rounded-full ${uploadProgress.stage === "failed" ? "bg-red-500" : uploadProgress.stage === "cancelled" ? "bg-muted" : "bg-accent"}`}
                style={{ width: `${uploadProgress.percent ?? 0}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              {uploadProgress.percent === null ? "Measuring upload…" : `${uploadProgress.percent}%`}
              {" · "}
              {(uploadProgress.loaded / (1024 * 1024)).toFixed(1)} / {(uploadProgress.total / (1024 * 1024)).toFixed(1)} MB
            </span>
            <span>
              Elapsed: {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}
            </span>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-xs text-muted" role="status">{message}</p> : null}
      <div className="mt-5 space-y-2">
        {assets.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.kind}</p>
              <p className="text-xs text-muted">
                {a.verified ? "Storage-verified" : "Uploaded record · awaiting storage verification"}
                {a.byteSize ? ` · ${(a.byteSize / (1024 * 1024)).toFixed(1)} MB` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!a.verified && canUpload ? (
                <button
                  type="button"
                  disabled={verifyingAssetId !== null || uploading !== null}
                  onClick={() => void retryVerification(a.id)}
                  className="rounded-full border border-line px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {verifyingAssetId === a.id ? "Verifying…" : "Retry verification"}
                </button>
              ) : null}
              {a.verified ? (
                <button
                  type="button"
                  onClick={() => void download(a.id)}
                  className="rounded-full border border-line px-4 py-2 text-xs font-semibold"
                >
                  Preview / Download
                </button>
              ) : null}
            </div>
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
