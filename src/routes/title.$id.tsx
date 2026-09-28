import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusRail } from "@/components/bridge/status-rail";
import { confirmAssetUpload, listTitleAssets, requestAssetUpload } from "@/lib/bridge/assets";
import { getLoopPublication } from "@/lib/bridge/loop-publication";
import { getTitleSupplyChain } from "@/lib/bridge/supply-chain";
import { getTitle } from "@/lib/bridge/titles";
import type { AssetKind } from "@/lib/bridge/types";
import { hasPermission } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";
import type { GateState } from "@/lib/bridge/supply-readiness";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const WORKSPACE_TABS = [
  "Overview", "Metadata", "Video", "Audio & Dubs", "Subtitles & Accessibility",
  "Artwork", "Documents", "QC", "Legal", "Rights", "Licensing", "Distribution",
  "Loop", "Revenue", "Audit",
] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => <BridgeShell actor={actor} title="Title Workspace"><TitleBody id={id} actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");
  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({ queryKey: ["bridge-assets", id], queryFn: () => listTitleAssets({ data: { titleId: id } }) });
  const chainQ = useQuery({ queryKey: ["bridge-supply", id], queryFn: () => getTitleSupplyChain({ data: { titleId: id } }) });
  const pubQ = useQuery({ queryKey: ["loop-pub", id], queryFn: () => getLoopPublication({ data: { bridgeTitleId: id } }) });
  const title = titleQ.data?.title;
  const assets = assetsQ.data?.assets ?? [];
  const chain = chainQ.data;
  const pub = pubQ.data?.publication;
  const canUpload = hasPermission(actor, "asset.sign_upload")
    && (actor.userId === title?.ownerUserId || Boolean(actor.internalRole));

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

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
        <div className="mt-6"><StatusRail status={title.status} /></div>
      </section>

      <section aria-label="Distribution readiness" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {chain ? (
          (Object.entries(chain.gates) as [string, { state: GateState; detail: string }][]).map(([label, gate]) => (
            <Gate key={label} label={label} state={gate.state} detail={gate.detail} />
          ))
        ) : (
          <p className="text-sm text-muted">Loading recorded gates…</p>
        )}
      </section>

      <nav aria-label="Title Workspace Sections" className="flex gap-2 overflow-x-auto border-b border-line pb-3">
        {WORKSPACE_TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${activeTab === tab ? "bg-fg text-bg font-semibold" : "border border-line bg-surface text-muted hover:text-fg"}`}>
            {tab}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{activeTab}</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-fg">{workspaceHeading(activeTab)}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{sectionDetail(activeTab, chain)}</p>
        {activeTab === "Video" && canUpload ? <UploadPanel titleId={title.id} /> : null}
        {activeTab === "Revenue" ? (
          <p className="mt-4 rounded-xl border border-line bg-elevated/40 p-4 text-sm text-muted">Verified usage and closed quarterly statements are unavailable. No estimated revenue is shown.</p>
        ) : null}
        {activeTab === "Loop" ? (
          <p className="mt-4 text-sm text-muted">Loop authorization: {pub?.authorizationStatus ?? "not recorded"}.</p>
        ) : null}
        <ul className="mt-6 space-y-2 text-xs">
          {assets.length ? assets.map((asset) => (
            <li key={asset.id} className="flex items-center justify-between rounded-xl border border-line bg-elevated/40 px-4 py-3 font-mono">
              <span>{asset.kind.toUpperCase()} · {asset.verified ? "VERIFIED" : "UNVERIFIED"} · {asset.id}</span>
              <span className="text-faint">PRIVATE</span>
            </li>
          )) : <li className="text-sm text-muted">No verified private objects.</li>}
        </ul>
      </section>
    </div>
  );
}

function UploadPanel({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (file: File) => {
      const kind: AssetKind = file.type.startsWith("image/") ? "poster" : file.name.toLowerCase().endsWith(".srt") || file.name.toLowerCase().endsWith(".vtt") ? "subtitle" : "master";
      const signed = await requestAssetUpload({
        data: { titleId, kind, filename: file.name, contentType: file.type || "application/octet-stream" },
      });
      const put = await fetch(signed.url, {
        method: signed.method,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Private upload failed before verification");
      await confirmAssetUpload({ data: { assetId: signed.assetId, expectedByteSize: file.size } });
    },
    onSuccess: () => {
      toast.success("Upload verified");
      void qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] });
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
      void qc.invalidateQueries({ queryKey: ["bridge-supply", titleId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });
  return (
    <label className="mt-5 block rounded-2xl border border-dashed border-line bg-elevated/30 p-5 text-sm">
      <span className="font-semibold text-fg">Upload a private master, poster or subtitle</span>
      <span className="mt-1 block text-xs text-muted">The title reference changes only after object storage confirms size. An interrupted upload stays unverified.</span>
      <input type="file" className="mt-4 block w-full text-xs" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) mut.mutate(file);
      }} />
    </label>
  );
}

function Gate({ label, state, detail }: { label: string; state: GateState; detail: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3" title={detail}>
      <p className="text-[10px] font-semibold tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-xs font-semibold text-fg">{state}</p>
    </div>
  );
}

function workspaceHeading(tab: WorkspaceTab) {
  const map: Record<WorkspaceTab, string> = {
    Overview: "Recorded supply chain",
    Metadata: "Title and metadata",
    Video: "Video masters",
    "Audio & Dubs": "Audio versions",
    "Subtitles & Accessibility": "Subtitles and accessibility",
    Artwork: "Artwork",
    Documents: "Legal evidence",
    QC: "Technical QC",
    Legal: "Legal approval",
    Rights: "Rights and avails",
    Licensing: "Commercial grants",
    Distribution: "Destination packages",
    Loop: "Loop publication",
    Revenue: "Revenue",
    Audit: "Audit",
  };
  return map[tab];
}

function sectionDetail(tab: WorkspaceTab, chain: { recordsAvailable: boolean; qcStatus: string | null; legalStatus: string | null; rightsCount: number; packageState: string | null; gates: Record<string, { detail: string }> } | undefined) {
  if (!chain) return "Loading recorded status.";
  if (tab === "QC") return chain.gates.QC.detail;
  if (tab === "Legal") return chain.gates.LEGAL.detail;
  if (tab === "Rights" || tab === "Licensing") return chain.recordsAvailable ? `${chain.rightsCount} grant record(s). ${chain.gates.RIGHTS.detail}` : chain.gates.RIGHTS.detail;
  if (tab === "Distribution" || tab === "Loop") return chain.gates.AUTHORIZED.detail;
  if (tab === "Revenue") return "Source-backed earnings are not available.";
  if (!chain.recordsAvailable && ["QC", "Legal", "Rights", "Licensing", "Distribution"].includes(tab)) return chain.gates.QC.detail;
  return "Shown from recorded Bridge rows. Missing records stay unavailable instead of inferred.";
}
