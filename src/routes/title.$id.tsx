import { canOperateOnTitle } from "@/lib/bridge/rbac";
import { getTitleWorkflow } from "@/lib/bridge/workflow";
import { WorkflowDesk } from "@/components/bridge/workflow-desk";
import { publicationIsActive } from "@/lib/bridge/workflow-policy";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle, updateTitle } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import {
  confirmAssetUpload,
  listTitleAssets,
  removeIncompleteAsset,
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

const WORKSPACE_TABS = ["Overview", "Files", "Operations"] as const;
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
  const posterQ = useQuery({
    queryKey: ["bridge-title-poster-preview", id],
    queryFn: async () => {
      const result = await listTitleAssets({ data: { titleId: id } });
      const asset = ["poster_vertical", "poster"]
        .map((kind) => result.assets.find((item) => item.kind === kind && item.verified))
        .find(Boolean);
      if (!asset) return null;
      const signed = await requestAssetDownload({ data: { assetId: asset.id } });
      return signed.url;
    },
    retry: false,
    staleTime: 4 * 60 * 1000,
  });
  const pub = pubQ.data?.publication;

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (titleQ.isError)
    return <p role="alert">Title workspace unavailable: {titleQ.error.message}</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  const copyTitleId = async () => {
    try {
      await navigator.clipboard.writeText(title.id);
      toast("Title ID copied");
    } catch {
      toast.error("Could not copy Title ID. Check browser clipboard permissions.");
    }
  };

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
        <div className="grid gap-4 md:grid-cols-[112px_1fr]">
          <div className="aspect-[2/3] max-h-44 overflow-hidden rounded-lg border border-line bg-elevated">
            {posterQ.data ? (
              <img src={posterQ.data} alt={`${title.name} poster`} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center px-3 text-center text-xs text-muted">
                {posterQ.isError ? "Poster preview unavailable" : "Add vertical poster"}
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
                {actor.internalRole ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">Title ID</span>
                    <code className="max-w-full break-all rounded-md border border-line bg-elevated px-2 py-1 text-xs">{title.id}</code>
                    <button type="button" onClick={() => void copyTitleId()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-elevated" aria-label={`Copy title ID for ${title.name}`}>
                      Copy ID
                    </button>
                  </div>
                ) : null}
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
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Overview</p>
            <h2 className="mt-1 font-display text-lg font-semibold">Title details & readiness</h2>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          canManage={actor.internalRole === "admin" || actor.internalRole === "super_admin"}
          onAssetsChanged={() => assetsQ.refetch()}
        />
      ) : activeTab === "Operations" ? (
        <WorkflowDesk title={title} actor={actor} />
      ) : null}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-elevated/30 p-3">
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
  canManage,
}: {
  canUpload: boolean;
  canManage: boolean;
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
  const [filesView, setFilesView] = useState<"upload" | "gallery">("upload");
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
    setUploadProgress(0);
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
      // Use the provider-issued PAR URL verbatim; rewriting its encoded path can target a different object.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(signed.method, signed.url);
        xhr.setRequestHeader("content-type", contentType);
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.min(99, Math.floor((event.loaded / event.total) * 100));
          setUploadProgress(percent);
          setMessage(`Uploading ${kind}: ${(event.loaded / (1024 * 1024)).toFixed(1)} of ${(file.size / (1024 * 1024)).toFixed(1)} MB (${percent}%)…`);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Browser could not reach OCI storage (status 0). Check bucket CORS, network access, and upload URL expiry."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.send(file);
      });
      setMessage("Upload transferred. Verifying stored file…");
      await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
      await onAssetsChanged();
      setUploadProgress(100);
      setMessage(`${kind[0].toUpperCase() + kind.slice(1)} is ready and verified.`);
      toast.success(`${kind[0].toUpperCase() + kind.slice(1)} uploaded and verified`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed";
      const detail = raw.includes("STORAGE_UNAVAILABLE")
        ? "Storage service is currently unavailable. Please try again later."
        : raw;
      setMessage(detail);
      toast.error(detail);
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
  const readyCount = cards.filter(([kind]) =>
    assets.some((asset) =>
      (asset.kind === kind || (kind === "poster_vertical" && asset.kind === "poster")) &&
      asset.verified,
    ),
  ).length;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Media library</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Title files</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Upload or replace delivery assets, then review secure previews and downloads in the gallery.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-elevated/40 px-4 py-3">
            <p className="text-xs text-muted">Package readiness</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{readyCount}<span className="text-sm font-normal text-muted"> / {cards.length} assets</span></p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4" role="tablist" aria-label="Title files views">
          <button
            type="button"
            role="tab"
            aria-selected={filesView === "upload"}
            onClick={() => setFilesView("upload")}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${filesView === "upload" ? "bg-fg text-bg" : "border border-line text-muted hover:bg-elevated hover:text-fg"}`}
          >
            Upload & Replace
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filesView === "gallery"}
            onClick={() => setFilesView("gallery")}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${filesView === "gallery" ? "bg-fg text-bg" : "border border-line text-muted hover:bg-elevated hover:text-fg"}`}
          >
            Media Gallery <span className="ml-1 opacity-75">({assets.length})</span>
          </button>
        </div>
      </div>

      {filesView === "upload" ? (
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="font-display text-lg font-semibold">Upload & replace assets</h3>
            <p className="mt-1 text-sm text-muted">Required and optional files are listed separately with accepted formats.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([kind, label, empty]) => (
              <FileTypeCard
                key={kind}
                kind={kind}
                label={label}
                status={assets.some((a) => (a.kind === kind || (kind === "poster_vertical" && a.kind === "poster")) && a.verified) ? "Ready" : empty}
                busy={uploading === kind}
                progress={uploading === kind ? uploadProgress : 0}
                canUpload={canUpload}
                onFile={(file) => void uploadFile(kind, file)}
              />
            ))}
          </div>
          {message ? <p role="status" className="mt-3 rounded-lg bg-elevated/50 p-3 text-sm text-muted">{message}</p> : null}
          {!canUpload ? <p className="mt-3 text-xs text-muted">Uploads are unavailable for your role or while this title is outside an editable preparation state.</p> : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <TitleAssetPreviewGallery assets={assets} onDownload={(id) => void download(id)} onAssetsChanged={onAssetsChanged} canManage={canManage} />
        </div>
      )}
    </section>
  );
}
function FileTypeCard({
  kind,
  label,
  status,
  busy,
  progress,
  onFile,
  canUpload,
}: {
  canUpload: boolean;
  kind: SimpleAssetKind;
  label: string;
  status: string;
  busy: boolean;
  progress: number;
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
      {busy ? (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Transfer progress</span>
            <span className="font-semibold tabular-nums">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-label={`${label} upload progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-accent-strong transition-[width] duration-150" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}


type PreviewAsset = {
  id: string;
  kind: string;
  contentType: string | null;
  byteSize: number | null;
  verified: boolean;
};

const IMAGE_ASSET_KINDS = new Set(["poster", "poster_vertical", "poster_horizontal", "thumbnail"]);

function TitleAssetPreviewGallery({
  assets,
  onDownload,
  onAssetsChanged,
  canManage,
}: {
  assets: PreviewAsset[];
  onDownload: (id: string) => void;
  onAssetsChanged: () => Promise<unknown> | unknown;
  canManage: boolean;
}) {
  const labelFor = (kind: string) =>
    ({
      master: "Main Film / Original Master",
      screener: "Trailer / Screener",
      poster: "Poster",
      poster_vertical: "Vertical Poster",
      poster_horizontal: "Horizontal Artwork",
      thumbnail: "Thumbnail",
      subtitle: "Subtitle",
      censor_certificate: "Censor Certificate",
      technical: "Technical Package",
    })[kind] ?? kind.replaceAll("_", " ");

  return (
    <section aria-label="Title Assets — Preview Gallery" className="mt-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Files / Media</p>
        <h3 className="mt-1 font-display text-lg font-semibold">Title Assets — Preview Gallery</h3>
        <p className="mt-1 text-xs text-muted">Previews use authenticated, short-lived links. Download remains available.</p>
      </div>
      {assets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">No verified assets are available to preview yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <PreviewAssetCard key={asset.id} asset={asset} label={labelFor(asset.kind)} onDownload={onDownload} onAssetsChanged={onAssetsChanged} canManage={canManage} />
          ))}
        </div>
      )}
    </section>
  );
}

function PreviewAssetCard({
  asset,
  label,
  onDownload,
  onAssetsChanged,
  canManage,
}: {
  asset: PreviewAsset;
  label: string;
  onDownload: (id: string) => void;
  onAssetsChanged: () => Promise<unknown> | unknown;
  canManage: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);
  const removeMutation = useMutation({
    mutationFn: () => removeIncompleteAsset({ data: { assetId: asset.id } }),
    onSuccess: async () => {
      setRemoveConfirm(false);
      setRemoveMessage("Incomplete upload removed.");
      await onAssetsChanged();
    },
    onError: (cause) => setRemoveMessage(cause instanceof Error ? cause.message : "Could not remove incomplete upload"),
  });
  const isImage = IMAGE_ASSET_KINDS.has(asset.kind);
  const isVideo = asset.kind === "master" || asset.kind === "screener";
  const isCertificate = asset.kind === "censor_certificate";
  const isSubtitle = asset.kind === "subtitle";
  const isPdf = asset.contentType?.toLowerCase().includes("pdf") ?? false;
  const sizeLabel = asset.byteSize ? `${(asset.byteSize / (1024 * 1024)).toFixed(1)} MB` : "Size unavailable";

  const loadPreview = useCallback(async () => {
    if (!asset.verified) {
      setError("This asset has not been verified yet.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // This existing server function enforces title access, entitlement, and master restrictions
      // before issuing a short-lived OCI Object Storage read URL.
      const signed = await requestAssetDownload({ data: { assetId: asset.id } });
      setPreviewUrl(signed.url);
      if (isSubtitle) {
        const response = await fetch(signed.url);
        if (!response.ok) throw new Error(`Subtitle preview failed (${response.status})`);
        const text = await response.text();
        setPreviewText(text.slice(0, 200_000));
      }
    } catch (cause) {
      setPreviewUrl(null);
      setPreviewText(null);
      setError(cause instanceof Error ? cause.message : "Preview unavailable. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [asset.id, asset.verified, isSubtitle]);

  useEffect(() => {
    if (isImage && asset.verified) void loadPreview();
  }, [asset.verified, isImage, loadPreview]);

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{label}</h4>
          <p className="mt-1 text-xs text-muted">{asset.verified ? "Ready" : "Processing"} · {sizeLabel}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[10px] font-semibold">
          {asset.contentType?.split(";")[0] || asset.kind}
        </span>
      </div>
      <div className="p-3">
        {!asset.verified ? (
          <div className="grid min-h-36 place-items-center rounded-lg bg-elevated p-4 text-center text-xs text-muted">Preview will be available after verification.</div>
        ) : loading && !previewUrl ? (
          <div role="status" className="grid min-h-36 place-items-center rounded-lg bg-elevated p-4 text-xs text-muted">Loading secure preview…</div>
        ) : error ? (
          <div className="grid min-h-36 place-items-center rounded-lg bg-elevated p-4 text-center">
            <p role="alert" className="text-xs text-muted">{error}</p>
            <button type="button" onClick={() => void loadPreview()} className="mt-3 rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Retry preview</button>
          </div>
        ) : isImage && previewUrl ? (
          <button type="button" onClick={() => setExpanded(true)} className="group block w-full overflow-hidden rounded-lg bg-elevated text-left" aria-label={`Open original ${label} preview`}>
            <img src={previewUrl} alt={label} loading="lazy" className={asset.kind === "poster_vertical" || asset.kind === "poster" ? "mx-auto max-h-72 w-auto object-contain" : "h-44 w-full object-contain"} />
            <span className="block px-3 py-2 text-xs text-muted group-hover:text-fg">Click to view original dimensions</span>
          </button>
        ) : isVideo && previewUrl ? (
          <div className="space-y-2">
            <video src={previewUrl} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" onError={() => setError("This file or codec may not be supported by the browser. Download remains available.")}>
              Your browser cannot play this media format.
            </video>
            {asset.kind === "master" ? <p className="text-[11px] text-muted">Master access is restricted by the server to the title owner or authorized internal staff.</p> : null}
          </div>
        ) : isSubtitle && previewUrl && previewText !== null ? (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-elevated p-3 text-xs leading-5">{previewText || "Subtitle file is empty."}</pre>
        ) : isCertificate && previewUrl && isPdf ? (
          <iframe title={`${label} PDF preview`} src={previewUrl} className="h-64 w-full rounded-lg border border-line bg-white" />
        ) : isCertificate && previewUrl && asset.contentType?.startsWith("image/") ? (
          <button type="button" onClick={() => setExpanded(true)} className="block w-full rounded-lg bg-elevated p-2">
            <img src={previewUrl} alt={label} className="mx-auto max-h-64 object-contain" />
            <span className="mt-2 block text-xs text-muted">Click to view original</span>
          </button>
        ) : previewUrl ? (
          <div className="grid min-h-36 place-items-center rounded-lg bg-elevated p-4 text-center">
            <p className="text-xs text-muted">Inline preview may not be supported for this file type.</p>
            <button type="button" onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")} className="mt-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Open preview</button>
          </div>
        ) : (
          <div className="grid min-h-36 place-items-center rounded-lg bg-elevated p-4 text-center">
            <p className="text-xs text-muted">{isVideo ? "Play supported video formats directly in this gallery." : isSubtitle ? "View SRT/VTT text inline." : isCertificate ? "Preview PDF or image certificates inline." : "Secure preview available on request."}</p>
            <button type="button" onClick={() => void loadPreview()} className="mt-3 rounded-full border border-line px-3 py-1.5 text-xs font-semibold">{loading ? "Loading…" : "Load preview"}</button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line p-3">
        <span className="text-[11px] text-muted">Secure preview</span>
        <div className="flex items-center gap-2">
          {canManage && !asset.verified ? <button type="button" onClick={() => { setRemoveMessage(null); setRemoveConfirm(true); }} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-elevated">Remove</button> : null}
          {asset.verified ? <button type="button" onClick={() => onDownload(asset.id)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-elevated">Download</button> : null}
        </div>
      </div>
      {removeConfirm ? (
        <div role="dialog" aria-modal="true" aria-label="Remove incomplete asset" className="border-t border-line bg-elevated p-3">
          <p className="text-xs text-muted">Remove this incomplete upload and clean up its temporary storage object?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setRemoveConfirm(false)} className="rounded-full border border-line px-3 py-1.5 text-xs">Cancel</button>
            <button type="button" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-destructive">{removeMutation.isPending ? "Removing…" : "Confirm remove"}</button>
          </div>
        </div>
      ) : null}
      {removeMessage ? <p role={removeMutation.isError ? "alert" : "status"} className="px-3 pb-3 text-xs text-muted">{removeMessage}</p> : null}
      {expanded && previewUrl ? (
        <div role="dialog" aria-modal="true" aria-label={`Original preview: ${label}`} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setExpanded(false)}>
          <div className="relative flex max-h-[95vh] max-w-[95vw] flex-col items-center" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setExpanded(false)} className="mb-3 self-end rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">Close preview</button>
            <img src={previewUrl} alt={`${label} original dimensions`} className="max-h-[82vh] max-w-[92vw] object-contain" />
          </div>
        </div>
      ) : null}
    </article>
  );
}
