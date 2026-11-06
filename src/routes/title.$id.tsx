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
  abortAssetMultipart,
  beginAssetMultipart,
  commitAssetMultipart,
  getAssetMultipartStatus,
  recordAssetMultipartPart,
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
import {
  MULTIPART_MIN_FILE,
  MULTIPART_PART_SIZE,
  type UploadSession,
  loadedBytes,
  nextPart,
  partCount,
  partSlice,
  sameUploadFile,
  sessionStorageKey,
} from "@/lib/bridge/multipart-upload";
import { AssetPosterSlot, AssetPreviewGallery } from "@/components/bridge/asset-preview-gallery";

export const Route = createFileRoute("/title/$id")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: TitlePage,
});

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
  const [chosenTab, setChosenTab] = useState<WorkspaceTab | null>(null);

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
  const activeTab: WorkspaceTab =
    chosenTab ??
    (title && ["DRAFT", "UPLOADING", "PREPARING"].includes(title.status) ? "Files" : "Overview");

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
          <AssetPosterSlot assets={assets} />
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
                onClick={() => setChosenTab("Files")}
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
            onClick={() => setChosenTab(tab)}
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
  const activeMultipart = useRef<UploadSession | null>(null);
  const announcedPause = useRef<string | null>(null);

  useEffect(() => {
    if (uploading) return;
    for (const kind of ["master", "screener", "poster", "poster_vertical", "poster_horizontal", "thumbnail", "subtitle", "censor_certificate"] as SimpleAssetKind[]) {
      const session = readUploadSession(titleId, kind);
      if (!session) continue;
      if (verifiedFor(assets, kind)) {
        clearUploadSession(titleId, kind);
        continue;
      }
      const key = `${session.assetId}:${session.completedParts.length}:${session.committed}`;
      if (announcedPause.current === key) return;
      announcedPause.current = key;
      const percent = Math.floor((loadedBytes(session.completedParts, session.fileSize, session.partSize) / session.fileSize) * 100);
      announce(
        session.committed
          ? `${kindLabel(kind)} is in storage and still needs verification. Do not select a different file.`
          : `${kindLabel(kind)} paused at ${percent}%. Choose the same file to continue. A refresh or connection drop keeps the completed parts.`,
      );
      return;
    }
  }, [assets, titleId, uploading]);

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
      xhr.timeout = 0;
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
        reject(new Error("File transfer timed out. No Ready status was set; select the file again to retry."));
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

  function putPart(url: string, blob: Blob, contentType: string, onLoaded: (loaded: number) => void) {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr;
      let stall: ReturnType<typeof setTimeout> | undefined;
      const bump = () => {
        if (stall) clearTimeout(stall);
        stall = setTimeout(() => xhr.abort(), 90_000);
      };
      xhr.open("PUT", url, true);
      xhr.setRequestHeader("content-type", contentType);
      xhr.timeout = 0;
      xhr.upload.onprogress = (event) => {
        bump();
        onLoaded(event.loaded);
      };
      xhr.onload = () => {
        if (stall) clearTimeout(stall);
        uploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader("etag")?.replaceAll('"', "");
          if (!etag) reject(new Error("OCI did not expose the uploaded part ETag; check bucket CORS ExposeHeaders"));
          else resolve(etag);
        } else reject(new Error(`Part upload failed (${xhr.status}). Completed parts were kept. Choose the same file to continue.`));
      };
      xhr.onerror = () => {
        if (stall) clearTimeout(stall);
        uploadXhrRef.current = null;
        reject(new TypeError("connection"));
      };
      xhr.onabort = () => {
        if (stall) clearTimeout(stall);
        uploadXhrRef.current = null;
        reject(new Error(cancelRequestedRef.current ? "cancelled" : "stalled"));
      };
      bump();
      xhr.send(blob);
    });
  }

  async function runMultipart(kind: SimpleAssetKind, file: File, contentType: string, assertAttemptActive: () => void) {
    const existing = readUploadSession(titleId, kind);
    if (existing && !sameUploadFile(existing, file)) {
      throw new Error(`A paused ${kindLabel(kind)} upload is waiting for ${existing.fileName}. Choose that file to continue, or cancel it first.`);
    }
    let session = existing;
    if (!session) {
      const signed = await withTimeout(
        requestAssetUpload({ data: { titleId, kind, filename: asciiUploadName(file.name), contentType, byteSize: file.size } }),
        20_000,
        "Upload URL preparation",
      );
      assertAttemptActive();
      const started = await withTimeout(
        beginAssetMultipart({ data: { assetId: signed.assetId, byteSize: file.size } }),
        20_000,
        "Multipart preparation",
      );
      assertAttemptActive();
      if (started.alreadyVerified) return signed.assetId;
      session = {
        version: 3,
        titleId,
        kind,
        assetId: signed.assetId,
        uploadId: started.uploadId,
        sessionId: started.sessionId,
        partBaseUrl: started.partBaseUrl,
        sessionToken: started.sessionToken,
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        partSize: MULTIPART_PART_SIZE,
        completedParts: [],
        committed: false,
        expiresAt: started.expiresAt,
      };
      writeUploadSession(session);
    }
    activeMultipart.current = session;
    // The database manifest is authoritative. localStorage retains only the selected
    // file fingerprint and signed capability needed to reconnect this browser.
    const durable = await getAssetMultipartStatus({ data: {
      assetId: session.assetId, sessionId: session.sessionId, sessionToken: session.sessionToken,
    } });
    session = { ...session, completedParts: durable.completedParts, committed: durable.committed };
    writeUploadSession(session);
    activeMultipart.current = session;
    if (!session.committed) {
      const total = partCount(session.fileSize, session.partSize);
      setProgress({
        kind,
        phase: "transferring",
        percent: Math.floor((loadedBytes(session.completedParts, session.fileSize, session.partSize) / session.fileSize) * 100),
        etaSeconds: null,
        loaded: loadedBytes(session.completedParts, session.fileSize, session.partSize),
        total: session.fileSize,
      });
      announce(`Uploading ${kindLabel(kind)} in parts. A connection drop keeps the completed parts.`);
      for (let part = nextPart(session.completedParts, total); part !== null; part = nextPart(session.completedParts, total)) {
        assertAttemptActive();
        const { start, end } = partSlice(session.fileSize, part, session.partSize);
        const baseLoaded = loadedBytes(session.completedParts, session.fileSize, session.partSize);
        let sent = false;
        for (let attempt = 1; attempt <= 4 && !sent; attempt += 1) {
          assertAttemptActive();
          try {
            const etag = await putPart(session.partBaseUrl + String(part), file.slice(start, end), contentType, (loaded) => {
              const transferred = Math.min(session!.fileSize, baseLoaded + loaded);
              setProgress({
                kind,
                phase: "transferring",
                percent: Math.floor((transferred / session!.fileSize) * 100),
                etaSeconds: null,
                loaded: transferred,
                total: session!.fileSize,
              });
            });
            sent = true;
          } catch (error) {
            const raw = error instanceof Error ? error.message : "";
            if (raw === "cancelled") throw new Error("Upload cancelled. The asset was not marked Ready.");
            if (attempt === 4) {
              throw new Error("Connection dropped. Choose the same file to continue. Completed parts were kept.");
            }
            await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
          }
        }
        await recordAssetMultipartPart({ data: {
          assetId: session.assetId, sessionId: session.sessionId, sessionToken: session.sessionToken,
          partNumber: part, byteStart: start, byteEnd: end, etag,
        } });
        session = { ...session, completedParts: [...session.completedParts, part] };
        writeUploadSession(session);
        activeMultipart.current = session;
      }
      assertAttemptActive();
      await withTimeout(
        commitAssetMultipart({ data: { assetId: session.assetId, sessionId: session.sessionId, sessionToken: session.sessionToken } }),
        30_000,
        "Multipart commit",
      );
      session = { ...session, committed: true };
      writeUploadSession(session);
      activeMultipart.current = session;
    }
    return session.assetId;
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
    announce(`Preparing ${kindLabel(kind)}.`);
    try {
      let assetId: string;
      if (file.size > MULTIPART_MIN_FILE) {
        assetId = await runMultipart(kind, file, contentType, assertAttemptActive);
      } else {
      const signed = await withTimeout(
        requestAssetUpload({ data: { titleId, kind, filename, contentType, byteSize: file.size } }),
        20_000,
        "Upload URL preparation",
      );

      // Cancellation can happen while URL preparation is pending. Never start a PUT for a stale attempt.
      assertAttemptActive();
      // Use the OCI pre-authenticated URL verbatim; rewriting its encoded path can invalidate it.
      setProgress({ kind, phase: "transferring", percent: 0, etaSeconds: null, loaded: 0, total: file.size });
      announce(`Uploading ${kindLabel(kind)}…`);
      await transferWithProgress(kind, signed.url, signed.method, file, contentType);
      assertAttemptActive();
      assetId = signed.assetId;
      }

      setProgress({ kind, phase: "verifying", percent: null, etaSeconds: null, loaded: file.size, total: file.size });
      announce(`File received. Verifying ${kindLabel(kind)} before it can show Ready…`);
      assertAttemptActive();
      await withTimeout(
        confirmAssetUpload({ data: { assetId, expectedByteSize: file.size } }),
        55_000,
        "Stored-object verification",
      );
      assertAttemptActive();

      setProgress({ kind, phase: "refreshing", percent: null, etaSeconds: null, loaded: file.size, total: file.size });
      announce("Storage verified. Refreshing the asset list…");
      await withTimeout(Promise.resolve(onAssetsChanged()), 15_000, "Asset refresh");
      assertAttemptActive();
      clearUploadSession(titleId, kind);
      activeMultipart.current = null;
      setProgress(null);
      announce(`${kindLabel(kind)} is ready.`, "success", true);
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
      } else if (!cancelled && !raw.includes("No Ready status") && !raw.includes("Completed parts") && !raw.includes("paused")) {
        detail = `${raw} Refresh the asset list to confirm its status before retrying.`;
      }
      announce(detail, "error", true);
    } finally {
      if (uploadAttemptRef.current === attemptId) {
        uploadXhrRef.current = null;
        cancelRequestedRef.current = false;
        setUploading(null);
      }
    }
  }

  async function download(id: string) {
    const signed = await requestAssetDownload({ data: { assetId: id } });
    window.open(signed.url, "_blank", "noopener,noreferrer");
  }

  const groups: { title: string; hint: string; items: [SimpleAssetKind, string][] }[] = [
    {
      title: "1 · Picture",
      hint: "Main film and trailer are both required for QC submission.",
      items: [
        ["master", "Required"],
        ["screener", "Required"],
      ],
    },
    {
      title: "2 · Artwork",
      hint: "All three artwork files are mandatory and must be Storage verified.",
      items: [
        ["poster_vertical", "Required"],
        ["poster_horizontal", "Required"],
        ["thumbnail", "Required"],
      ],
    },
    {
      title: "3 · Documents",
      hint: "Subtitles and the censor/legal certificate are mandatory for QC submission.",
      items: [
        ["subtitle", "Required"],
        ["censor_certificate", "Required"],
      ],
    },
  ];
  const phaseSteps = [
    ["preparing", "Prepare"],
    ["transferring", "Transfer"],
    ["verifying", "Verify"],
    ["refreshing", "Refresh"],
  ] as const;
  const readyCount = groups
    .flatMap((group) => group.items)
    .filter(([kind]) => verifiedFor(assets, kind)).length;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Upload</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Package in three steps</h2>
          <p className="mt-1 text-sm text-muted">{readyCount} of 7 files ready. A file is Ready only after storage verification.</p>
        </div>
      </div>

      {progress ? (
        <div className="mt-5 rounded-2xl border border-accent/30 bg-accent-soft p-4" aria-label="Upload progress">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold">{kindLabel(progress.kind)}</p>
              <p className="mt-1 text-sm text-muted">
                {progress.phase === "transferring" && progress.percent !== null
                  ? `${progress.percent}% · ${(progress.loaded / (1024 * 1024)).toFixed(1)} of ${(progress.total / (1024 * 1024)).toFixed(1)} MB · ${formatEta(progress.etaSeconds)}`
                  : progress.phase === "preparing" ? "Getting a secure upload link…"
                  : progress.phase === "verifying" ? "Checking the stored file. Do not upload it again yet."
                  : "Updating the file list…"}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                cancelRequestedRef.current = true;
                uploadAttemptRef.current += 1;
                const session = activeMultipart.current;
                activeMultipart.current = null;
                uploadXhrRef.current?.abort();
                if (session) {
                  try {
                    // Do not forget the browser session until the provider abort and
                    // server-side manifest cleanup have both been acknowledged.
                    await abortAssetMultipart({
                      data: {
                        assetId: session.assetId,
                        sessionId: session.sessionId,
                        sessionToken: session.sessionToken,
                      },
                    });
                    clearUploadSession(session.titleId, session.kind);
                  } catch {
                    activeMultipart.current = session;
                    writeUploadSession(session);
                    cancelRequestedRef.current = false;
                    setUploading(session.kind);
                    announce(
                      "Multipart cleanup could not be confirmed. Do not start a replacement upload; retry Cancel or resume this same file.",
                      "error",
                      true,
                    );
                    return;
                  }
                }
                cancelRequestedRef.current = false;
                setProgress(null);
                announce("Upload cancelled. Provider parts and the durable part manifest were discarded.", "error", true);
                setUploading(null);
              }}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
          <ol className="mt-3 flex flex-wrap gap-2">
            {phaseSteps.map(([phase, label]) => (
              <li
                key={phase}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${progress.phase === phase ? "bg-fg text-bg" : "bg-surface text-muted"}`}
              >
                {label}
              </li>
            ))}
          </ol>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-white"
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
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="mb-3">
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <p className="text-xs text-muted">{group.hint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map(([kind, empty]) => {
                const verified = verifiedFor(assets, kind);
                return (
                  <FileTypeCard
                    key={kind}
                    kind={kind}
                    label={kindLabel(kind)}
                    status={verified ? "Ready" : empty}
                    busy={uploading === kind}
                    locked={uploading !== null && uploading !== kind}
                    canUpload={canUpload}
                    onFile={(file) => void uploadFile(kind, file)}
                    onDownload={verified ? () => void download(verified.id) : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {message ? (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageKind === "error" ? "border-red-300 bg-red-50 text-red-700" : messageKind === "success" ? "border-green-300 bg-green-50 text-green-800" : "border-line bg-elevated text-fg"}`}
          role={messageKind === "error" ? "alert" : "status"}
          aria-live={messageKind === "error" ? "assertive" : "polite"}
        >
          {message}
        </p>
      ) : null}
      <div className="mt-3">
        {notificationPermission === "default" ? (
          <button
            type="button"
            onClick={() => {
              if ("Notification" in window) {
                void Notification.requestPermission().then((permission) => {
                  setNotificationPermission(permission);
                  if (permission === "granted") announce("Desktop notifications are on.");
                });
              }
            }}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
          >
            Notify me when a file is ready
          </button>
        ) : notificationPermission === "granted" ? (
          <span className="text-xs text-muted">You will be notified when a file is ready.</span>
        ) : null}
      </div>
      {assets.some((asset) => !asset.verified) ? (
        <p className="mt-4 text-sm text-muted">
          Still processing: {assets.filter((asset) => !asset.verified).map((asset) => displayKind(asset.kind)).join(", ")}. For a large film, choose the same file to continue. Do not upload it again from the start.
        </p>
      ) : null}
      <AssetPreviewGallery assets={assets} />
    </section>
  );
}

function readUploadSession(titleId: string, kind: string): UploadSession | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey(titleId, kind));
    if (!raw) return null;
    const session = JSON.parse(raw) as UploadSession;
    if (session.version !== 3 || session.titleId !== titleId || session.kind !== kind || typeof session.sessionToken !== "string" || !Array.isArray(session.completedParts)) return null;
    if (session.expiresAt <= Date.now()) {
      localStorage.removeItem(sessionStorageKey(titleId, kind));
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function writeUploadSession(session: UploadSession) {
  localStorage.setItem(sessionStorageKey(session.titleId, session.kind), JSON.stringify(session));
}

function clearUploadSession(titleId: string, kind: string) {
  localStorage.removeItem(sessionStorageKey(titleId, kind));
}

function displayKind(kind: string) {
  if (kind === "poster") return "Vertical poster";
  if (kind === "master" || kind === "screener" || kind === "poster_vertical" || kind === "poster_horizontal" || kind === "thumbnail" || kind === "subtitle" || kind === "censor_certificate") {
    return kindLabel(kind);
  }
  return kind.replaceAll("_", " ");
}

function kindLabel(kind: SimpleAssetKind) {
  if (kind === "master") return "Main film";
  if (kind === "screener") return "Trailer";
  if (kind === "poster_vertical") return "Vertical poster";
  if (kind === "poster_horizontal") return "Horizontal artwork";
  if (kind === "thumbnail") return "Thumbnail";
  if (kind === "subtitle") return "Subtitles";
  return "Censor certificate";
}

function verifiedFor(
  assets: Array<{ id: string; kind: string; verified: boolean }>,
  kind: SimpleAssetKind,
) {
  return assets.find((asset) => asset.verified && (asset.kind === kind || (kind === "poster_vertical" && asset.kind === "poster")));
}

function FileTypeCard({
  kind,
  label,
  status,
  busy,
  locked,
  onFile,
  onDownload,
  canUpload,
}: {
  canUpload: boolean;
  kind: SimpleAssetKind;
  label: string;
  status: string;
  busy: boolean;
  locked: boolean;
  onFile: (file: File) => void;
  onDownload?: () => void;
}) {
  const spec = OTT_INGEST_SPEC[kind];
  const ready = status === "Ready";
  return (
    <div className={`rounded-xl border p-4 ${ready ? "border-green-200 bg-green-50/60" : status === "Required" ? "border-line-strong bg-elevated/50" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className={`mt-1 text-xs font-semibold ${ready ? "text-green-700" : "text-muted"}`}>{ready ? "Ready" : status}</p>
          <p className="mt-2 text-[11px] leading-5 text-muted">
            {spec.extensions.map((ext) => ext.replace(".", "").toUpperCase()).join(", ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <label className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ${ready ? "border border-line bg-surface" : "bg-fg text-bg"} ${busy || locked || !canUpload ? "pointer-events-none opacity-50" : ""}`}>
            {busy ? "Uploading…" : ready ? "Replace" : "Upload"}
            <input
              className="sr-only"
              type="file"
              accept={getOttIngestAccept(kind)}
              disabled={busy || locked || !canUpload}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) onFile(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {onDownload ? (
            <button type="button" onClick={onDownload} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold">
              Download
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
