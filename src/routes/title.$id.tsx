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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [draft, setDraft] = useState<{ name: string; synopsis: string; language: string; year: string; runtimeMinutes: string } | null>(null);
  const [metadataSaved, setMetadataSaved] = useState(false);
  const queryClient = useQueryClient();
  const titleEditMutation = useMutation({
    mutationFn: (data: { name?: string; synopsis?: string; language?: string; year?: number | null; runtimeMinutes?: number | null }) => updateTitle({ data: { id, ...data } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-title", id] });
      setDraft(null);
      setMetadataSaved(true);
    },
  });
  const copyTitleId = async () => {
    try { await navigator.clipboard.writeText(id); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  };

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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="text-xs font-semibold text-muted">Title ID</span>
        <code className="min-w-0 break-all text-xs" data-testid="title-id">{title.id}</code>
        <button type="button" onClick={() => void copyTitleId()} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Copy ID</button>
        <span role="status" aria-live="polite" className="text-xs text-muted">{copyState === "copied" ? "Title ID copied." : copyState === "failed" ? "Copy failed. Select and copy the ID manually." : ""}</span>
      </div>

      {assetsQ.isError ? <p role="alert">Assets unavailable: {assetsQ.error.message}</p> : null}
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <div className="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-elevated">
            {(() => {
              const artwork = assets.find((asset) => ["poster_vertical", "poster", "thumbnail", "poster_horizontal"].includes(asset.kind) && asset.verified);
              return artwork ? (
                <ArtworkPreview assetId={artwork.id} version={artwork.key ? (artwork.key.split(".verified/")[1] || artwork.key) : ""} titleName={title.name} />
              ) : (
                <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">Add vertical poster or thumbnail</div>
              );
            })()}
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
          {draft === null ? (
            <button type="button" onClick={() => setDraft({
              name: title.name,
              synopsis: title.synopsis || "",
              language: title.language || "Malayalam",
              year: title.year == null ? "" : String(title.year),
              runtimeMinutes: title.runtimeMinutes == null ? "" : String(title.runtimeMinutes),
            })} className="mt-5 rounded-full border border-line px-4 py-2 text-xs font-semibold">Edit metadata</button>
          ) : (
            <form className="mt-5 space-y-3 rounded-xl border border-line p-4" onSubmit={(event) => {
              event.preventDefault();
              if (titleEditMutation.isPending) return;
              const year = draft.year.trim() ? Number(draft.year) : null;
              const runtimeMinutes = draft.runtimeMinutes.trim() ? Number(draft.runtimeMinutes) : null;
              if (draft.year.trim() && !Number.isInteger(year)) return;
              if (draft.runtimeMinutes.trim() && (!Number.isInteger(runtimeMinutes) || Number(runtimeMinutes) < 1)) return;
              titleEditMutation.mutate({ name: draft.name.trim(), synopsis: draft.synopsis, language: draft.language.trim(), year, runtimeMinutes });
            }}>
              <label className="block text-sm">Title name<input required value={draft.name} disabled={titleEditMutation.isPending} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 block w-full rounded-lg border border-line bg-elevated px-3 py-2" /></label>
              <label className="block text-sm">Synopsis<textarea value={draft.synopsis} disabled={titleEditMutation.isPending} onChange={(e) => setDraft({ ...draft, synopsis: e.target.value })} className="mt-1 block w-full rounded-lg border border-line bg-elevated px-3 py-2" rows={3} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">Language<input required value={draft.language} disabled={titleEditMutation.isPending} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className="mt-1 block w-full rounded-lg border border-line bg-elevated px-3 py-2" /></label>
                <label className="block text-sm">Year<input inputMode="numeric" value={draft.year} disabled={titleEditMutation.isPending} onChange={(e) => setDraft({ ...draft, year: e.target.value })} className="mt-1 block w-full rounded-lg border border-line bg-elevated px-3 py-2" /></label>
                <label className="block text-sm">Runtime (minutes)<input inputMode="numeric" value={draft.runtimeMinutes} disabled={titleEditMutation.isPending} onChange={(e) => setDraft({ ...draft, runtimeMinutes: e.target.value })} className="mt-1 block w-full rounded-lg border border-line bg-elevated px-3 py-2" /></label>
              </div>
              {titleEditMutation.isError ? <p role="alert" className="text-xs text-red-600">Save failed: {titleEditMutation.error instanceof Error ? titleEditMutation.error.message : "Please retry."}</p> : null}
              {draft.name !== title.name || draft.synopsis !== (title.synopsis || "") || draft.language !== (title.language || "Malayalam") || draft.year !== (title.year == null ? "" : String(title.year)) || draft.runtimeMinutes !== (title.runtimeMinutes == null ? "" : String(title.runtimeMinutes)) ? <p role="status" className="text-xs text-muted">Unsaved changes</p> : <p className="text-xs text-muted">No unsaved changes</p>}
              <div className="flex gap-2"><button type="submit" disabled={titleEditMutation.isPending || !(draft.name !== title.name || draft.synopsis !== (title.synopsis || "") || draft.language !== (title.language || "Malayalam") || draft.year !== (title.year == null ? "" : String(title.year)) || draft.runtimeMinutes !== (title.runtimeMinutes == null ? "" : String(title.runtimeMinutes)))} className="rounded-full bg-fg px-4 py-2 text-xs font-semibold text-bg">{titleEditMutation.isPending ? "Saving…" : "Save Changes"}</button><button type="button" disabled={titleEditMutation.isPending} onClick={() => { setDraft(null); titleEditMutation.reset(); }} className="rounded-full border border-line px-4 py-2 text-xs font-semibold">Cancel</button></div>
            </form>
          )}
          {metadataSaved ? <p role="status" aria-live="polite" className="mt-3 text-xs text-muted">Metadata changes saved.</p> : null}
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

function ArtworkPreview({ assetId, version, titleName }: { assetId: string; version: string; titleName: string }) {
  const previewQ = useQuery({
    queryKey: ["bridge-artwork-preview", assetId, version],
    queryFn: () => requestAssetPreview({ data: { assetId, version } }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  if (!previewQ.data?.url) {
    return <div role={previewQ.isError ? "alert" : "status"} className="grid h-full place-items-center px-4 text-center text-xs text-muted">
      {previewQ.isError ? "Artwork preview unavailable" : "Loading artwork…"}
    </div>;
  }
  return <img src={previewQ.data.url} alt={`${titleName} artwork`} className="h-full w-full object-cover" loading="eager" />;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-elevated/40 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

type SimpleAssetKind = "master" | "poster" | "poster_vertical" | "poster_horizontal" | "thumbnail" | "subtitle" | "screener" | "censor_certificate";
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
    key?: string | null;
    kind: string;
    contentType: string | null;
    byteSize: number | null;
    verified: boolean;
  }>;
  onAssetsChanged: () => Promise<unknown> | unknown;
}) {
  const [uploading, setUploading] = useState<SimpleAssetKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const uploadLock = useRef(false);
  async function uploadFile(kind: SimpleAssetKind, file: File) {
    if (uploadLock.current) return;
    uploadLock.current = true;
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
      const put = await fetch(uploadUrl.toString(), {
        method: signed.method,
        body: file,
        headers: { "content-type": contentType },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
      await onAssetsChanged();
      await queryClient.invalidateQueries({ queryKey: ["bridge-title", titleId] });
      setMessage(`${kind[0].toUpperCase() + kind.slice(1)} verified and saved.`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Upload failed";
      setMessage(
        raw.includes("STORAGE_UNAVAILABLE")
          ? "Storage service is currently unavailable. Please try again later."
          : raw,
      );
    } finally {
      uploadLock.current = false;
      setUploading(null);
    }
  }
  async function download(id: string) {
    const signed = await requestAssetDownload({ data: { assetId: id } });
    window.location.assign(signed.url);
  }
  const cards: [SimpleAssetKind, string, string][] = [
    ["master", "Main Film", "Required"],
    ["poster", "Poster", "Add"],
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
            canUpload={canUpload && uploading === null}
            onFile={(file) => void uploadFile(kind, file)}
          />
        ))}
      </div>
      {message ? <p role={/failed|unavailable|error|forbidden|mismatch|retry|not found/i.test(message) ? "alert" : "status"} aria-live="polite" className="mt-3 text-xs text-muted">{message}</p> : null}
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
