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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(actor.internalRole ? "Files" : "Overview");

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
type UploadProgress = {
  kind: SimpleAssetKind;
  phase: "preparing" | "transferring" | "verifying" | "refreshing";
  percent: number | null;
  etaSeconds: number | null;
  loaded: number;
  total: number;
};

function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "Calculating time remaining…";
  if (seconds <= 0) return "Almost done";
  if (seconds < 60) return `About ${Math.ceil(seconds)} sec remaining`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.ceil(seconds % 60);
  return remainder ? `About ${minutes} min ${remainder} sec remaining` : `About ${minutes} min remaining`;
}

function notifyUpload(message: string) {
  // Keep notifications in the page by default. Use a desktop notification only
  // when the user has already granted permission; never prompt unexpectedly.
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("Crayons Bridge · Upload", { body: message });
    } catch {
      // The accessible in-page status remains available if desktop notifications fail.
    }
  }
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
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"status" | "success" | "error">("status");
  const [notificationPermission, setNotificationPermission] = useState<"default" | "granted" | "denied" | "unsupported">(() =>
    typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission,
  );
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelRequestedRef = useRef(false);
  // Invalidates any in-flight preparation/confirmation continuation after cancel or a newer attempt.
  const uploadAttemptRef = useRef(0);

  function announce(text: string, kind: "status" | "success" | "error" = "status", desktop = false) {
    setMessage(text);
    setMessageKind(kind);
    if (desktop) notifyUpload(text);
  }

  async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, phase: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${phase} timed out. Please retry the upload.`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  function transferWithProgress(kind: SimpleAssetKind, url: string, method: string, file: File, contentType: string) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr;
      const startedAt = Date.now();
      xhr.open(method, url, true);
      xhr.setRequestHeader("content-type", contentType);
      xhr.timeout = 120_000;
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : file.size;
        const loaded = Math.min(event.loaded, total);
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
        const bytesPerSecond = loaded / elapsedSeconds;
        const etaSeconds = bytesPerSecond > 0 ? Math.max(0, (total - loaded) / bytesPerSecond) : null;
        setProgress({
          kind,
          phase: "transferring",
          percent: total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : null,
          etaSeconds,
          loaded,
          total,
        });
      };
      xhr.onload = () => {
        uploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status}). No Ready status was set; please retry.`));
      };
      xhr.onerror = () => {
        uploadXhrRef.current = null;
        reject(new TypeError("The browser could not reach OCI storage. Check the OCI bucket CORS rule for this Preview origin, PUT method and Content-Type header."));
      };
      xhr.ontimeout = () => {
        uploadXhrRef.current = null;
        reject(new Error("File transfer timed out after 2 minutes. No Ready status was set; select the file again to retry."));
      };
      xhr.onabort = () => {
        uploadXhrRef.current = null;
        reject(new Error(cancelRequestedRef.current
          ? "Upload cancelled. The asset was not marked Ready; select the file again to retry."
          : "File transfer was interrupted. The asset was not marked Ready; select the file again to retry."));
      };
      xhr.send(file);
    });
  }

  async function uploadFile(kind: SimpleAssetKind, file: File) {
    if (uploading) return;
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({ kind, filename, contentType });
    if (!validation.ok) {
      announce(validation.message, "error");
      return;
    }

    cancelRequestedRef.current = false;
    const attemptId = ++uploadAttemptRef.current;
    const assertAttemptActive = () => {
      if (cancelRequestedRef.current || uploadAttemptRef.current !== attemptId) {
        throw new Error("Upload cancelled. No further transfer or confirmation will be started by this attempt.");
      }
    };
    setUploading(kind);
    setProgress({ kind, phase: "preparing", percent: null, etaSeconds: null, loaded: 0, total: file.size });
    announce(`Preparing ${kind} upload. You can follow progress here.`);
    let transferTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const signed = await withTimeout(
        requestAssetUpload({ data: { titleId, kind, filename, contentType } }),
        20_000,
        "Upload URL preparation",
      );

      // Cancellation can happen while URL preparation is pending. Never start a PUT for a stale attempt.
      assertAttemptActive();
      // Use the OCI pre-authenticated URL verbatim; rewriting its encoded path can invalidate it.
      setProgress({ kind, phase: "transferring", percent: 0, etaSeconds: null, loaded: 0, total: file.size });
      announce(`Uploading ${kind}…`);
      transferTimer = setTimeout(() => uploadXhrRef.current?.abort(), 120_000);
      await transferWithProgress(kind, signed.url, signed.method, file, contentType);
      assertAttemptActive();
      if (transferTimer !== undefined) clearTimeout(transferTimer);
      transferTimer = undefined;

      setProgress({ kind, phase: "verifying", percent: null, etaSeconds: null, loaded: file.size, total: file.size });
      announce(`Upload transferred. Verifying stored ${kind} before marking it Ready…`);
      assertAttemptActive();
      await withTimeout(
        confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } }),
        55_000,
        "Stored-object verification",
      );
      assertAttemptActive();

      setProgress({ kind, phase: "refreshing", percent: null, etaSeconds: null, loaded: file.size, total: file.size });
      announce("Storage verified. Refreshing the asset list…");
      await withTimeout(Promise.resolve(onAssetsChanged()), 15_000, "Asset refresh");
      assertAttemptActive();
      setProgress(null);
      announce(`${kind[0].toUpperCase() + kind.slice(1)} is ready after storage verification.`, "success", true);
    } catch (error) {
      // A cancelled/superseded attempt must not overwrite the status of a newer upload.
      if (uploadAttemptRef.current !== attemptId) return;
      const raw = error instanceof Error ? error.message : "Upload failed";
      setProgress(null);
      const cancelled = cancelRequestedRef.current;
      let detail = raw;
      if (raw.includes("STORAGE_UNAVAILABLE")) {
        detail = "Storage service is currently unavailable. Check the isolated Preview configuration, then select the file again to retry.";
      } else if (error instanceof TypeError) {
        detail = "The browser could not reach OCI storage. Check the OCI bucket CORS rule for this Preview origin, PUT method and Content-Type header, then select the file again to retry.";
      } else if (raw.includes("Stored-object verification timed out")) {
        // A browser timeout cannot cancel server-side verification. Avoid claiming
        // the asset is unverified or encouraging a blind retry while that request runs.
        detail = `${raw} The server may still be finishing verification. Refresh the asset list and check its status before retrying.`;
      } else if (!cancelled && !raw.includes("No Ready status")) {
        detail = `${raw} Refresh the asset list to confirm its status before retrying.`;
      }
      announce(detail, "error", true);
    } finally {
      if (transferTimer !== undefined) clearTimeout(transferTimer);
      if (uploadAttemptRef.current === attemptId) {
        uploadXhrRef.current = null;
        cancelRequestedRef.current = false;
        setUploading(null);
      }
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

  const phaseLabel = progress
    ? progress.phase === "preparing" ? "Preparing secure upload"
      : progress.phase === "transferring" ? "Transferring to storage"
      : progress.phase === "verifying" ? "Verifying stored object"
      : "Refreshing verified assets"
    : "";

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Media</p>
          <h2 className="mt-1 font-display text-xl font-semibold">OTT package</h2>
        </div>
        <span className="text-xs text-muted">Ready / Missing</span>
      </div>

      {progress ? (
        <div className="mt-5 rounded-xl border border-line bg-elevated/40 p-4" aria-label="Upload progress">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{progress.kind.replaceAll("_", " ")} · {phaseLabel}</p>
              <p className="mt-1 text-xs text-muted">
                {progress.phase === "transferring" && progress.percent !== null
                  ? `${progress.percent}% · ${(progress.loaded / (1024 * 1024)).toFixed(1)} of ${(progress.total / (1024 * 1024)).toFixed(1)} MB · ${formatEta(progress.etaSeconds)}`
                  : progress.phase === "preparing" ? "Getting a secure upload URL…"
                  : progress.phase === "verifying" ? "Checking the stored object's size, type and verification evidence…"
                  : "Refreshing the verified asset list…"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                cancelRequestedRef.current = true;
                // Invalidate this attempt so a late URL-preparation result cannot start a PUT.
                uploadAttemptRef.current += 1;
                uploadXhrRef.current?.abort();
                setProgress(null);
                announce("Upload cancelled. Any pending preparation result will be ignored; no new transfer will start from this attempt.", "error", true);
                if (!uploadXhrRef.current) {
                  setUploading(null);
                }
              }}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
            >
              Cancel upload
            </button>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Upload transfer progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.phase === "transferring" ? progress.percent ?? 0 : undefined}
          >
            <div
              className={`h-full rounded-full bg-accent transition-[width] duration-200 ${progress.percent === null ? "w-1/3 animate-pulse" : ""}`}
              style={progress.percent === null ? undefined : { width: `${progress.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">The file is not Ready until server-side storage verification succeeds.</p>
        </div>
      ) : null}

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
      {message ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${messageKind === "error" ? "border-red-300 text-red-700" : messageKind === "success" ? "border-green-300 text-green-700" : "border-line text-muted"}`}
          role={messageKind === "error" ? "alert" : "status"}
          aria-live={messageKind === "error" ? "assertive" : "polite"}
        >
          {message}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted">Upload status and errors appear here.</p>
        {notificationPermission === "default" ? (
          <button
            type="button"
            onClick={() => {
              if ("Notification" in window) {
                void Notification.requestPermission().then((permission) => {
                  setNotificationPermission(permission);
                  if (permission === "granted") announce("Desktop upload notifications enabled.");
                });
              }
            }}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
          >
            Enable desktop notifications
          </button>
        ) : notificationPermission === "granted" ? (
          <span className="text-xs text-muted">Desktop notifications enabled</span>
        ) : null}
      </div>
      <div className="mt-5 space-y-2">
        {assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
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
