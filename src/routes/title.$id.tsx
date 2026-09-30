import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getTitle } from "@/lib/bridge/titles";
import { confirmAssetUpload, listTitleAssets, requestAssetDownload, requestAssetUpload } from "@/lib/bridge/assets";
import { getLoopPublication } from "@/lib/bridge/loop-publication";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const CREATOR_TABS = ["Overview", "Files", "Rights", "Distribution", "Revenue"] as const;
type CreatorTab = (typeof CREATOR_TABS)[number];

const OPS_TABS = [
  "Overview", "Metadata", "Video", "Audio & Dubs", "Subtitles & Accessibility",
  "Artwork", "Documents", "QC", "Legal", "Rights", "Licensing", "Distribution",
  "Loop", "Revenue", "Audit",
] as const;
type OpsTab = (typeof OPS_TABS)[number];

type WorkspaceTab = CreatorTab | OpsTab;

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => <BridgeShell actor={actor} title="Title Workspace"><TitleBody id={id} actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const creatorMode = actor.accountType === "independent_creator" && !actor.internalRole;
  const tabs = creatorMode ? CREATOR_TABS : OPS_TABS;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");

  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({ queryKey: ["bridge-assets", id], queryFn: () => listTitleAssets({ data: { titleId: id } }) });
  const pubQ = useQuery({ queryKey: ["loop-pub", id], queryFn: () => getLoopPublication({ data: { bridgeTitleId: id } }) });

  const title = titleQ.data?.title;
  const assets = assetsQ.data?.assets ?? [];
  const pub = pubQ.data?.publication;

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  const ingestReady = assets.length > 0;
  const qcReady = Boolean(title.masterKey);
  const legalReady = ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status);
  const rightsReady = legalReady;
  const packageReady = Boolean(qcReady && legalReady);
  const distributionReady = Boolean(pub?.authorizationStatus);
  const currentStep = !ingestReady ? 2 : !rightsReady ? 3 : !packageReady ? 4 : 5;

  return (
    <div className="space-y-7">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Crayons Bridge · Canonical Title</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">{title.name}</h1>
            <p className="mt-2 text-xs text-muted">{title.language}{title.year ? ` · ${title.year}` : ""} · <span className="font-mono">{title.id}</span></p>
          </div>
          <p className="rounded-full border border-line bg-elevated px-4 py-2 text-xs text-muted">Signed in · {actor.internalRole || actor.accountType}</p>
        </div>
      </section>

      {creatorMode ? (
        <>
          <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your submission</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-fg">What to do next</h2>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold text-muted">Draft</span>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-5">
              <CreatorStep n={1} label="DETAILS" state="done" />
              <CreatorStep n={2} label="FILES" state={currentStep === 2 ? "current" : "done"} />
              <CreatorStep n={3} label="RIGHTS" state={currentStep === 3 ? "current" : currentStep > 3 ? "done" : "todo"} />
              <CreatorStep n={4} label="REVIEW" state={currentStep === 4 ? "current" : currentStep > 4 ? "done" : "todo"} />
              <CreatorStep n={5} label="DISTRIBUTION" state={currentStep === 5 ? "current" : "todo"} />
            </div>

            {!ingestReady && (
              <div className="mt-8 rounded-2xl border border-line bg-elevated/40 p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Complete your submission</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-fg">Upload your master film</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Your master film is required before Bridge can begin technical review and distribution preparation.</p>
                <button type="button" onClick={() => setActiveTab("Files")} className="mt-5 rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">Upload Master Film</button>
                <p className="mt-4 text-xs text-muted">You can also add Audio & Dubs · Subtitles · Artwork · Documents</p>
              </div>
            )}
          </section>

          <nav aria-label="Creator workspace sections" className="flex gap-2 overflow-x-auto border-b border-line pb-3">
            {CREATOR_TABS.map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${activeTab === tab ? "bg-fg text-bg font-semibold" : "border border-line bg-surface text-muted hover:text-fg"}`}>
                {tab}
              </button>
            ))}
          </nav>

          <CreatorPanel
            activeTab={activeTab as CreatorTab}
            assetsCount={assets.length}
            titleStatus={title.status}
            hasMaster={Boolean(title.masterKey)}
            distributionReady={distributionReady}
            packageReady={packageReady}
            loopStatus={pub?.authorizationStatus}
            titleId={id}
            assets={assets}
            onAssetsChanged={() => assetsQ.refetch()}
          />

          <section className="grid gap-4 md:grid-cols-2">
            <Destination
              name="Crayons Loop"
              state={distributionReady ? "AUTHORIZED" : packageReady ? "READY TO SUBMIT" : "NOT READY"}
              detail={distributionReady ? "This title has an active Bridge publication authorization for Crayons Loop." : "Complete the required files and rights information first."}
            />
            <Destination
              name="External destinations"
              state="NOT STARTED"
              detail="Additional OTT, broadcast, airline, festival and buyer deliveries become available when rights and agreements are recorded."
            />
          </section>
        </>
      ) : (
        <>
          <section aria-label="Distribution readiness" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Gate label="INGEST" ready={ingestReady} />
            <Gate label="QC" ready={qcReady} />
            <Gate label="LEGAL" ready={legalReady} />
            <Gate label="RIGHTS" ready={rightsReady} />
            <Gate label="PACKAGE" ready={packageReady} />
            <Gate label="AUTHORIZED" ready={distributionReady} />
          </section>

          <nav aria-label="Title Workspace Sections" className="flex gap-2 overflow-x-auto border-b border-line pb-3">
            {OPS_TABS.map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${activeTab === tab ? "bg-fg text-bg font-semibold" : "border border-line bg-surface text-muted hover:text-fg"}`}>
                {tab}
              </button>
            ))}
          </nav>

          <section className="rounded-2xl border border-line bg-surface p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{activeTab}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-fg">{workspaceHeading(activeTab as OpsTab)}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{workspaceCopy(activeTab as OpsTab)}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Private assets" value={String(assets.length)} />
              <Metric label="Bridge lifecycle" value={title.status} />
              <Metric label="Master" value={title.masterKey ? "VERIFIED" : "REQUIRED"} />
              <Metric label="Crayons Loop" value={pub?.authorizationStatus?.toUpperCase() || "NOT STARTED"} />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Destination name="Crayons Loop" state={distributionReady ? "AUTHORIZED" : packageReady ? "READY TO PUBLISH" : "NOT STARTED"} detail="Consumer catalog, merchandising, playback and entitlements. Rights remain controlled by Bridge." />
            <Destination name="External destinations" state="AGREEMENT REQUIRED" detail="OTT, broadcast, TVOD, SVOD, AVOD, FAST, airline, festival, educational and controlled buyer delivery activate only against recorded grants." />
          </section>
        </>
      )}
    </div>
  );
}

function CreatorStep({ n, label, state }: { n: number; label: string; state: "done" | "current" | "todo" }) {
  const text = state === "done" ? "Complete" : state === "current" ? "Current" : "Not started";
  return (
    <div className={`rounded-2xl border p-4 ${state === "current" ? "border-fg bg-elevated" : "border-line bg-surface"}`}>
      <p className="text-[10px] font-semibold tracking-[0.16em] text-muted">{String(n).padStart(2, "0")} · {label}</p>
      <p className="mt-2 text-xs font-semibold text-fg">{text}</p>
    </div>
  );
}

function CreatorPanel({
  activeTab, assetsCount, titleStatus, hasMaster, distributionReady, packageReady, loopStatus, titleId, assets, onAssetsChanged,
}: {
  activeTab: CreatorTab; assetsCount: number; titleStatus: string; hasMaster: boolean;
  distributionReady: boolean; packageReady: boolean; loopStatus?: string | null;
  titleId: string;
  assets: Array<{ id: string; kind: string; contentType: string | null; byteSize: number | null; verified: boolean }>;
  onAssetsChanged: () => Promise<unknown> | unknown;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadMessage("Preparing secure upload…");
    try {
      const signed = await requestAssetUpload({ data: {
        titleId,
        kind: "master",
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      } });
      setUploadMessage("Uploading to private object storage…");
      const put = await fetch(signed.url, {
        method: signed.method,
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setUploadMessage("Verifying and sealing master…");
      await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
      await onAssetsChanged();
      setUploadMessage("Master verified and sealed.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function downloadAsset(assetId: string) {
    const signed = await requestAssetDownload({ data: { assetId } });
    window.location.assign(signed.url);
  }
  if (activeTab === "Overview") {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Overview</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-fg">Submission status</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Files added" value={String(assetsCount)} />
          <Metric label="Submission" value={titleStatus === "DRAFT" ? "DRAFT" : titleStatus} />
          <Metric label="Master film" value={hasMaster ? "VERIFIED" : "REQUIRED"} />
          <Metric label="Crayons Loop" value={distributionReady ? "AUTHORIZED" : packageReady ? "READY TO SUBMIT" : "NOT SUBMITTED"} />
        </div>
      </section>
    );
  }

  const content: Record<CreatorTab, { title: string; copy: string }> = {
    Overview: { title: "Submission status", copy: "" },
    Files: { title: "Files", copy: "Add your master film, audio and dubs, subtitles, artwork and supporting documents in one place." },
    Rights: { title: "Rights", copy: "Provide the ownership and rights information Bridge needs before distribution can be approved." },
    Distribution: { title: "Distribution", copy: distributionReady ? `Crayons Loop is authorized${loopStatus ? ` · ${loopStatus}` : ""}.` : "Distribution becomes available after your required files and rights information are complete." },
    Revenue: { title: "Revenue", copy: "Revenue and settlement information will appear here when an authorized destination reports transactions." },
  };
  const panel = content[activeTab];

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{activeTab}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-fg">{panel.title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{panel.copy}</p>
      {activeTab === "Files" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-line bg-elevated/40 p-5">
            <p className="text-sm font-semibold text-fg">Master Video</p>
            <p className="mt-1 text-xs text-muted">Upload directly to the private Bridge object store. Bridge verifies the object before accepting it.</p>
            <label className="mt-4 inline-flex cursor-pointer rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg">
              {uploading ? "Uploading…" : "Choose Master Film"}
              <input
                className="sr-only"
                type="file"
                accept="video/*,.mxf,.mov,.mp4"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void uploadFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {uploadMessage && <p className="mt-3 text-xs text-muted">{uploadMessage}</p>}
          </div>
          {assets.length > 0 && (
            <div className="space-y-2">
              {assets.map((asset) => (
                <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                  <div>
                    <p className="text-sm font-semibold text-fg">{asset.kind}</p>
                    <p className="mt-1 text-xs text-muted">{asset.verified ? "Verified" : "Processing"}{asset.byteSize ? ` · ${asset.byteSize.toLocaleString()} bytes` : ""}</p>
                  </div>
                  {asset.verified && (
                    <button type="button" onClick={() => void downloadAsset(asset.id)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-fg">
                      Download
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["Audio & Dubs", "Subtitles & Accessibility", "Artwork", "Documents"].map((name) => (
              <div key={name} className="rounded-xl border border-line bg-elevated/40 p-4">
                <p className="text-sm font-semibold text-fg">{name}</p>
                <p className="mt-1 text-xs text-muted">Available after master ingest.</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Gate({ label, ready }: { label: string; ready: boolean }) {
  return <div className="rounded-xl border border-line bg-surface p-3"><p className="text-[10px] font-semibold tracking-wider text-muted">{label}</p><p className="mt-1 text-xs font-semibold text-fg">{ready ? "PASS" : "NOT STARTED"}</p></div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line bg-elevated/40 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-semibold text-fg">{value}</p></div>;
}
function Destination({ name, state, detail }: { name: string; state: string; detail: string }) {
  return <article className="rounded-2xl border border-line bg-surface p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-display text-lg font-semibold text-fg">{name}</h3><span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold text-muted">{state}</span></div><p className="mt-3 text-xs leading-5 text-muted">{detail}</p></article>;
}
function workspaceHeading(tab: OpsTab) {
  const map: Record<OpsTab, string> = {
    Overview: "Title supply-chain overview", Metadata: "Title & metadata", Video: "Video masters & versions", "Audio & Dubs": "Audio, M&E and dubbed versions", "Subtitles & Accessibility": "Subtitles, captions and accessibility", Artwork: "Artwork & promotional", Documents: "Certification & legal evidence", QC: "Technical QC desk", Legal: "Legal approval desk", Rights: "Rights & avails", Licensing: "Licensing & commercial grants", Distribution: "Destination packages", Loop: "Crayons Loop publication", Revenue: "Revenue & settlement", Audit: "Immutable activity trail",
  }; return map[tab];
}
function workspaceCopy(tab: OpsTab) {
  const map: Record<OpsTab, string> = {
    Overview: "One immutable Bridge UUID connects ingest, assets, QC, legal, rights, licensing and every authorized delivery.",
    Metadata: "Capture canonical consumer and business metadata without using display slugs as system identity.",
    Video: "Manage original mezzanine, clean/textless, alternate/platform cuts and trailers as versioned private assets.",
    "Audio & Dubs": "Track original mixes, stereo, 5.1, M&E, stems, audio description and dubbed languages independently.",
    "Subtitles & Accessibility": "Keep subtitles, SDH/CC, forced narrative and translated accessibility tracks as separate records.",
    Artwork: "Approve portrait, landscape/hero, square, title treatment, stills and promotional variants per destination.",
    Documents: "Store classification, chain-of-title, producer authority, music/artwork rights, releases and distribution evidence privately.",
    QC: "Technical QC is an independent gate with automated findings, reviewer findings and repair cycles.",
    Legal: "Legal approval is separate from QC and must be explicitly cleared before distribution authorization.",
    Rights: "Record territory, language, media, window, exclusivity, holdbacks, sublicensing, promotional rights and restrictions.",
    Licensing: "Create contract-backed grants and commercial terms while preserving Bridge as the rights authority.",
    Distribution: "Build destination-specific package versions only after QC, legal and rights gates pass.",
    Loop: "Publish only the approved consumer projection to Loop; never expose masters, contracts or legal evidence to the consumer runtime.",
    Revenue: "Reconcile destination usage, consumer revenue, shares and settlements back to the canonical Bridge title.",
    Audit: "Record approvals, grants, package versions, publication, suspension and revocation against the immutable title UUID.",
  }; return map[tab];
}
