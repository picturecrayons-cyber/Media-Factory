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
  validateOttIngestFile,
} from "@/lib/bridge/ott-ingest-spec";
import { asciiUploadName } from "@/lib/bridge/latin1";
import { commitMultipart, deleteUpload, getUpload, listUploads, MULTIPART_PART_SIZE, MULTIPART_THRESHOLD, saveUpload, startMultipart, uploadKey, uploadMultipartPart, type SavedUpload } from "@/lib/bridge/resumable-upload.client";

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
          userId={actor.userId}
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
type QueuedUpload = {
  id: string;
  file: File;
  kind: SimpleAssetKind;
  status: "queued" | "uploading" | "done" | "failed" | "invalid";
  error?: string;
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
  userId,
  assets,
  onAssetsChanged,
  canUpload,
}: {
  canUpload: boolean;
  titleId: string;
  userId: string;
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
  const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);
  const [savedUploads, setSavedUploads] = useState<SavedUpload[]>([]);
  useEffect(() => {
    let active = true;
    setSavedUploads([]);
    void listUploads().then(items => { if (active) setSavedUploads(items.filter(item => item.titleId === titleId && item.userId === userId)); }).catch(() => {
      if (active) announce("Resumable upload storage is unavailable in this browser.", "error");
    });
    return () => { active = false; };
  }, [titleId, userId]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const queuePausedRef = useRef(false);
  const queueRunningRef = useRef(false);
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

  async function uploadFile(kind: SimpleAssetKind, file: File): Promise<boolean> {
    if (uploading) return false;
    const filename = asciiUploadName(file.name);
    const contentType = file.type || "application/octet-stream";
    const validation = validateOttIngestFile({ kind, filename, contentType });
    if (!validation.ok) { announce(validation.message, "error"); return false; }
    cancelRequestedRef.current = false;
    const attemptId = ++uploadAttemptRef.current;
    const assertAttemptActive = () => {
      if (cancelRequestedRef.current || uploadAttemptRef.current !== attemptId) throw new Error("Upload cancelled; this attempt will not continue.");
    };
    const key = uploadKey(userId, titleId, kind, file);
    setUploading(kind);
    setProgress({ kind, phase: "preparing", percent: null, etaSeconds: null, loaded: 0, total: file.size });
    announce(`Preparing ${kind} upload.`);
    try {
      let saved = await getUpload(key);
      if (!saved) {
        const signed = await withTimeout(
          requestAssetUpload({ data: { titleId, kind, filename, contentType, fileSize: file.size } }),
          20_000, "Upload URL preparation",
        );
        saved = { key, titleId, userId, kind, filename, contentType, file, assetId: signed.assetId, parUrl: signed.url, completedParts: [], updatedAt: Date.now() };
        await saveUpload(saved);
        setSavedUploads(current => [...current.filter(item => item.key !== key), saved!]);
      }
      assertAttemptActive();
      if (file.size >= MULTIPART_THRESHOLD) {
        if (!saved.multipartUrl) {
          announce("Starting secure multipart session…");
          saved.multipartUrl = await startMultipart(saved.parUrl, contentType);
          saved.updatedAt = Date.now();
          await saveUpload(saved);
          setSavedUploads(current => [...current.filter(item => item.key !== key), saved!]);
        }
        const partSize = Math.max(MULTIPART_PART_SIZE, Math.ceil(file.size / 10_000));
        const totalParts = Math.ceil(file.size / partSize);
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          assertAttemptActive();
          if (saved.completedParts.some(part => part.number === partNumber)) continue;
          const loaded = Math.min(file.size, (partNumber - 1) * partSize);
          setProgress({ kind, phase: "transferring", percent: Math.floor(loaded / file.size * 100), etaSeconds: null, loaded, total: file.size });
          announce(`Uploading ${kind}: part ${partNumber} of ${totalParts}. Completed parts are saved for resume.`);
          const part = await uploadMultipartPart(saved.multipartUrl, file, partNumber, partSize);
          saved.completedParts = [...saved.completedParts.filter(item => item.number !== partNumber), part];
          saved.updatedAt = Date.now();
          await saveUpload(saved);
          setSavedUploads(current => [...current.filter(item => item.key !== key), saved!]);
          const after = Math.min(file.size, partNumber * partSize);
          setProgress({ kind, phase: "transferring", percent: Math.floor(after / file.size * 100), etaSeconds: null, loaded: after, total: file.size });
        }
        assertAttemptActive();
        announce("All parts uploaded. Committing multipart object…");
        try {
          await commitMultipart(saved.multipartUrl);
        } catch (commitError) {
          // A dropped response can hide a successful commit. Mark the asset as pending
          // before reconciliation so the UI never offers a blind re-upload.
          setProgress({ kind, phase: "verifying", percent: null, etaSeconds: null, loaded: file.size, total: file.size });
          saved.verificationPending = true;
          saved.updatedAt = Date.now();
          await saveUpload(saved);
          setSavedUploads(current => [...current.filter(item => item.key !== key), saved!]);
          announce("Multipart commit response was lost. Checking the existing asset; do not re-upload it.", "status", true);
          try {
            await withTimeout(
              confirmAssetUpload({ data: { assetId: saved.assetId, expectedByteSize: file.size } }),
              55_000,
              "Multipart commit reconciliation",
            );
          } catch {
            throw commitError;
          }
        }
      } else {
        setProgress({ kind, phase: "transferring", percent: 0, etaSeconds: null, loaded: 0, total: file.size });
        announce(`Uploading ${kind}…`);
        await transferWithProgress(kind, saved.parUrl, "PUT", file, contentType);
      }
      assertAttemptActive();
      setProgress({ kind, phase: "verifying", percent: null, etaSeconds: null, loaded: file.size, total: file.size });
      saved.verificationPending = true;
      saved.updatedAt = Date.now();
      await saveUpload(saved);
      setSavedUploads(current => [...current.filter(item => item.key !== key), saved!]);
      announce(`Upload transferred. Verifying stored ${kind} before marking it Ready…`);
      await withTimeout(confirmAssetUpload({ data: { assetId: saved.assetId, expectedByteSize: file.size } }), 55_000, "Stored-object verification");
      assertAttemptActive();
      setProgress({ kind, phase: "refreshing", percent: null, etaSeconds: null, loaded: file.size, total: file.size });
      await withTimeout(Promise.resolve(onAssetsChanged()), 15_000, "Asset refresh");
      await deleteUpload(key);
      setSavedUploads(current => current.filter(item => item.key !== key));
      setProgress(null);
      announce(`${kind[0].toUpperCase() + kind.slice(1)} is ready after storage verification.`, "success", true);
      return true;
    } catch (error) {
      if (uploadAttemptRef.current !== attemptId) return false;
      const raw = error instanceof Error ? error.message : "Upload failed";
      setProgress(null);
      const cancelled = cancelRequestedRef.current;
      const verificationMayStillBeRunning = raw.toLowerCase().includes("verification timed out") || raw.toLowerCase().includes("verification") && raw.toLowerCase().includes("timed out");
      announce(cancelled ? raw : verificationMayStillBeRunning
        ? `${raw} Server-side verification may still be running. Refresh asset status before taking further action; do not re-upload this file.`
        : `${raw} Saved upload state is retained when possible. Use Resume only if this asset has not entered server-side verification.`, "error", true);
      return false;
    } finally {
      if (uploadAttemptRef.current === attemptId) {
        uploadXhrRef.current = null;
        cancelRequestedRef.current = false;
        setUploading(null);
      }
    }
  }

  function inferKind(file: File, index: number, picked: File[]): SimpleAssetKind {
    const name = file.name.toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    if (/\.(srt|vtt|ttml|xml)$/i.test(name)) return "subtitle";
    if (/certificate|censor|cbfc|censorboard/.test(name) || ext === ".pdf") return "censor_certificate";
    if (/\.(mp4|mov|mxf)$/i.test(name)) {
      if (/trailer|teaser|screener/.test(name)) return "screener";
      const previousVideo = picked.slice(0, index).some((candidate) => /\.(mp4|mov|mxf)$/i.test(candidate.name));
      return previousVideo ? "screener" : "master";
    }
    if (/horizontal|landscape|banner|wide/.test(name)) return "poster_horizontal";
    if (/thumb|thumbnail/.test(name)) return "thumbnail";
    const priorImages = picked.slice(0, index).filter((candidate) => /\.(png|jpe?g|webp)$/i.test(candidate.name)).length;
    return priorImages === 0 ? "poster_vertical" : priorImages === 1 ? "poster_horizontal" : "thumbnail";
  }

  function addFiles(filesLike: FileList | File[]) {
    if (!canUpload) {
      announce("Uploads are not permitted for this title or account.", "error");
      return;
    }
    const files = Array.from(filesLike);
    if (!files.length) return;
    const additions: QueuedUpload[] = files.map((file, index) => {
      const kind = inferKind(file, index, files);
      const validation = validateOttIngestFile({
        kind,
        filename: asciiUploadName(file.name),
        contentType: file.type || "application/octet-stream",
      });
      return {
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind,
        status: validation.ok ? "queued" : "invalid",
        error: validation.ok ? undefined : validation.message,
      };
    });
    setQueuedUploads((current) => [...current, ...additions]);
    const invalid = additions.filter((item) => item.status === "invalid").length;
    announce(
      invalid
        ? `${files.length} file(s) added; ${invalid} need attention because the file type does not match the selected media slot.`
        : `${files.length} file(s) added to the upload queue. Review each media slot before starting.`,
      invalid ? "error" : "status",
    );
  }

  async function processQueue() {
    if (queueRunningRef.current) return;
    queueRunningRef.current = true;
    queuePausedRef.current = false;
    setQueueRunning(true);
    setQueuePaused(false);
    try {
      // Process only the snapshot present when Start/Resume is pressed; new files can be queued for the next pass.
      const batch = queuedUploads.filter((item) => item.status === "queued");
      for (const item of batch) {
        if (queuePausedRef.current) break;
        setQueuedUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "uploading", error: undefined } : entry));
        const ok = await uploadFile(item.kind, item.file);
        setQueuedUploads((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, status: ok ? "done" : "failed", error: ok ? undefined : "Upload did not finish successfully. Refresh and reconcile the asset status before adding a new attempt." }
          : entry));
      }
    } finally {
      queueRunningRef.current = false;
      setQueueRunning(false);
      setQueuePaused(queuePausedRef.current);
      if (queuePausedRef.current) announce("Queue paused between files. The current file was allowed to finish; resume to continue.", "status");
    }
  }

  function pauseQueue() {
    queuePausedRef.current = true;
    setQueuePaused(true);
    if (!queueRunningRef.current) announce("Queue paused. Resume when ready.", "status");
  }

  async function refreshAssetStatus() {
    try {
      const result = await onAssetsChanged() as { data?: { assets?: Array<{ id: string; verified: boolean }> } };
      const verifiedIds = new Set((result?.data?.assets ?? []).filter(asset => asset.verified).map(asset => asset.id));
      const completed = savedUploads.filter(saved => saved.verificationPending && verifiedIds.has(saved.assetId));
      for (const saved of completed) await deleteUpload(saved.key);
      if (completed.length) setSavedUploads(current => current.filter(saved => !verifiedIds.has(saved.assetId)));
      announce(verifiedIds.size
        ? "Asset status refreshed. Recorded storage verification is reflected in the asset list."
        : "No verified result is recorded yet. Keep this asset pending; do not re-upload it.", "status", true);
    } catch {
      announce("Could not refresh asset status. The current asset remains unverified until the server confirms it.", "error", true);
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

      <div
        className={`mt-5 rounded-xl border border-dashed p-6 text-center transition-colors ${dragActive ? "border-accent bg-elevated" : "border-line bg-elevated/30"}`}
        onDragEnter={(event) => { event.preventDefault(); if (canUpload) setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); if (canUpload) event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragActive(false); }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files); }}
      >
        <p className="text-sm font-semibold">Drag and drop media files here</p>
        <p className="mt-1 text-xs text-muted">Or select multiple files. Bridge will suggest a media slot; review the queue before starting.</p>
        <label className="mt-3 inline-flex cursor-pointer rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold">
          Browse files
          <input
            className="sr-only"
            type="file"
            multiple
            disabled={!canUpload || queueRunning}
            accept={[...new Set(Object.values(OTT_INGEST_SPEC).flatMap((spec) => [...spec.extensions, ...spec.mimeTypes]))].join(",")}
            onChange={(event) => { if (event.currentTarget.files) addFiles(event.currentTarget.files); event.currentTarget.value = ""; }}
          />
        </label>
      </div>

      {queuedUploads.length ? (
        <div className="mt-4 rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Upload queue · {queuedUploads.filter((item) => item.status === "done").length}/{queuedUploads.length} complete</p>
              <p className="mt-1 text-xs text-muted">Files upload one at a time. Pause stops the queue between files; it does not pause an active transfer or provide chunk-level resume.</p>
            </div>
            <div className="flex gap-2">
              {queueRunning
                ? <button type="button" onClick={pauseQueue} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Pause queue</button>
                : <button type="button" disabled={!canUpload || !queuedUploads.some((item) => item.status === "queued")} onClick={() => void processQueue()} className="rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg">{queuePaused ? "Resume queue" : "Start queue"}</button>}
              <button type="button" disabled={queueRunning} onClick={() => setQueuedUploads((current) => current.filter((item) => item.status === "done" || item.status === "uploading"))} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Clear finished</button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {queuedUploads.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p className="text-xs text-muted">{item.kind.replaceAll("_", " ")} · {(item.file.size / (1024 * 1024)).toFixed(1)} MB</p>
                  {item.error ? <p className="text-xs text-red-700">{item.error}</p> : null}
                </div>
                <select aria-label={`Media slot for ${item.file.name}`} value={item.kind} disabled={queueRunning || item.status === "done"} onChange={(event) => {
                  const kind = event.target.value as SimpleAssetKind;
                  const validation = validateOttIngestFile({ kind, filename: asciiUploadName(item.file.name), contentType: item.file.type || "application/octet-stream" });
                  setQueuedUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, kind, status: validation.ok ? "queued" : "invalid", error: validation.ok ? undefined : validation.message } : entry));
                }} className="max-w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs">
                  {cards.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                </select>
                <span className="text-xs font-semibold">{item.status === "done" ? "Verified" : item.status === "uploading" ? "Uploading" : item.status === "failed" ? "Failed" : item.status === "invalid" ? "Check file" : "Queued"}</span>
                {!queueRunning && item.status !== "done" ? <button type="button" aria-label={`Remove ${item.file.name} from queue`} onClick={() => setQueuedUploads((current) => current.filter((entry) => entry.id !== item.id))} className="rounded-full border border-line px-2 py-1 text-xs">Remove</button> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {savedUploads.length ? (
        <div className="mt-5 rounded-xl border border-line p-4">
          <p className="text-sm font-semibold">Saved uploads · Resume</p>
          <p className="mt-1 text-xs text-muted">Files and completed multipart parts are saved in this browser. Keep using this browser and profile; secure upload links expire.</p>
          <div className="mt-3 space-y-2">
            {savedUploads.map((saved) => (
              <div key={saved.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{saved.filename}</p>
                  <p className="text-xs text-muted">{saved.kind.replaceAll("_", " ")} · {(saved.file.size / (1024 * 1024)).toFixed(1)} MB · {saved.completedParts.length} parts saved{saved.verificationPending ? " · server verification pending; do not re-upload" : ""}</p>
                </div>
                {saved.verificationPending ? (
                  <button type="button" onClick={() => void refreshAssetStatus()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Refresh status</button>
                ) : (
                  <button type="button" disabled={Boolean(uploading) || !canUpload} onClick={() => void uploadFile(saved.kind as SimpleAssetKind, saved.file)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Resume</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
            {progress.phase === "verifying" || progress.phase === "refreshing" ? (
              <button type="button" onClick={() => void refreshAssetStatus()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Refresh status</button>
            ) : <button
              type="button"
              onClick={() => {
                cancelRequestedRef.current = true;
                if (progress.total >= MULTIPART_THRESHOLD && progress.phase === "transferring") {
                  // OCI cannot pause an in-flight part. Let it finish, persist its checkpoint, then stop before the next part/commit.
                  announce("Pausing after the current part. Completed parts are saved; use Resume to continue.", "status", true);
                  return;
                }
                // Invalidate a single-PUT/preparation attempt so a late URL result cannot start a transfer.
                uploadAttemptRef.current += 1;
                uploadXhrRef.current?.abort();
                setProgress(null);
                announce("Upload cancelled. Any pending preparation result will be ignored; no new transfer will start from this attempt.", "error", true);
                if (!uploadXhrRef.current) setUploading(null);
              }}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
            >
              {progress.total >= MULTIPART_THRESHOLD && progress.phase === "transferring" ? "Pause after part" : "Cancel upload"}
            </button>}
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
          <p className="mt-2 text-xs text-muted">{progress.phase === "verifying" || progress.phase === "refreshing" ? "Verification runs on the server and cannot be cancelled from this screen. Refresh status to check the recorded result; do not re-upload while verification is pending." : "The file is not Ready until server-side storage verification succeeds."}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {cards.map(([kind, label, empty]) => (
          <FileTypeCard
            key={kind}
            kind={kind}
            label={label}
            status={assets.some((a) => (a.kind === kind || (kind === "poster_vertical" && a.kind === "poster")) && a.verified) ? "Ready" : assets.some((a) => (a.kind === kind || (kind === "poster_vertical" && a.kind === "poster")) && !a.verified) ? "Verification pending" : empty}
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
          {busy ? "Working…" : status === "Ready" ? "Replace" : "Upload"}
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
