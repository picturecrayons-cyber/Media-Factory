import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusRail } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { advanceTitle, getTitle } from "@/lib/bridge/titles";
import { confirmAssetUpload, listTitleAssets, requestAssetUpload } from "@/lib/bridge/assets";
import {
  getLoopPublication,
  authorizeLoopPublication,
  suspendLoopPublication,
  revokeLoopPublication,
  extendDistributionWindow,
  type ExploitationModel,
} from "@/lib/bridge/loop-publication";
import { nextStatus } from "@/lib/bridge/lifecycle";
import { hasPermission, permissionForTransition } from "@/lib/bridge/rbac";
import type { AssetKind } from "@/lib/bridge/types";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const WORKSPACE_TABS = [
  "Overview",
  "Files",
  "Metadata",
  "QC",
  "Rights",
  "Licensing",
  "Distribution",
  "Delivery",
  "Team",
  "Billing",
] as const;

type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

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
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");
  const [distributeOpen, setDistributeOpen] = useState(false);

  // Queries
  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({ queryKey: ["bridge-assets", id], queryFn: () => listTitleAssets({ data: { titleId: id } }) });
  const pubQ = useQuery({ queryKey: ["loop-pub", id], queryFn: () => getLoopPublication({ data: { bridgeTitleId: id } }) });

  const title = titleQ.data?.title;
  const pub = pubQ.data?.publication;
  const assets = assetsQ.data?.assets ?? [];

  // Distribution Form State
  const [model, setModel] = useState<ExploitationModel>("SVOD");
  const [territories, setTerritories] = useState("IN");
  const [languages, setLanguages] = useState(title?.language || "Malayalam");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [rightsOwnerShare, setRightsOwnerShare] = useState("80");
  const [distributorShare, setDistributorShare] = useState("20");

  const nxt = title ? nextStatus(title.status) : null;
  const perm = title && nxt ? permissionForTransition(title.status, nxt) : null;
  const canAdvance = Boolean(title && nxt && nxt !== "LICENSED" && perm && hasPermission(actor, perm));
  const canUpload = Boolean(
    title &&
      hasPermission(actor, "asset.sign_upload") &&
      (title.ownerUserId === actor.userId || actor.internalRole) &&
      ["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)
  );
  const canDistribute = hasPermission(actor, "loop.publish");
  const canRevoke = hasPermission(actor, "loop.revoke");

  const isDistributionEligible = Boolean(
    title &&
      ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status) &&
      title.masterKey
  );

  const advance = useMutation({
    mutationFn: () => {
      if (!title || !nxt) throw new Error("No forward step");
      return advanceTitle({ data: { id: title.id, to: nxt } });
    },
    onSuccess: () => {
      toast.success("Lifecycle advanced");
      void qc.invalidateQueries({ queryKey: ["bridge-title", id] });
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Advance failed"),
  });

  const distributeMut = useMutation({
    mutationFn: () =>
      authorizeLoopPublication({
        data: {
          bridgeTitleId: id,
          destination: "CRAYONS_LOOP",
          territories: territories.split(",").map((t) => t.trim()).filter(Boolean),
          languages: languages.split(",").map((l) => l.trim()).filter(Boolean),
          exploitationModels: [model],
          accessTier: model === "FREE" ? "FREE" : model === "TVOD" ? "TVOD" : "SVOD",
          windowStart: windowStart ? new Date(windowStart).toISOString() : null,
          windowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
          commercialTerms: {
            rightsOwnerSharePct: Number(rightsOwnerShare) || 0,
            distributorSharePct: Number(distributorShare) || 0,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Distribution authorized and published to Crayons Loop");
      setDistributeOpen(false);
      void qc.invalidateQueries({ queryKey: ["loop-pub", id] });
      void qc.invalidateQueries({ queryKey: ["bridge-title", id] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Distribution authorization failed"),
  });

  const suspendMut = useMutation({
    mutationFn: () => suspendLoopPublication({ data: { bridgeTitleId: id, reason: "Title workspace suspension" } }),
    onSuccess: () => {
      toast.success("Distribution suspended");
      void qc.invalidateQueries({ queryKey: ["loop-pub", id] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Suspension failed"),
  });

  const revokeMut = useMutation({
    mutationFn: () => revokeLoopPublication({ data: { bridgeTitleId: id } }),
    onSuccess: () => {
      toast.success("Distribution revoked");
      void qc.invalidateQueries({ queryKey: ["loop-pub", id] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Revocation failed"),
  });

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title workspace…</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;

  return (
    <div className="space-y-8">
      {/* 1. Header Banner */}
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Crayons Bridge Title Record
        </p>
        <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">{title.name}</h1>
            {title.nameMl ? <p className="mt-1 text-sm text-muted">{title.nameMl}</p> : null}
            <p className="mt-2 text-xs text-muted">
              {title.language}
              {title.year ? ` · ${title.year}` : ""}
              {title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}
              <span className="ml-2 font-mono text-faint">ID: {title.id}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-elevated/50 px-4 py-3 text-xs">
            <p className="uppercase tracking-wider text-muted font-semibold">Commercial Basis</p>
            <p className="mt-1 font-semibold text-fg">
              {title.licensingFeePaise > 0
                ? `₹${(title.licensingFeePaise / 100).toFixed(0)} license fee`
                : "Standard distribution terms"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <StatusRail status={title.status} />
        </div>
      </section>

      {/* 2. Workspace Tabs */}
      <nav aria-label="Title Workspace Sections" className="flex gap-2 overflow-x-auto border-b border-line pb-2.5">
        {WORKSPACE_TABS.map((item) => {
          const isActive = activeTab === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setActiveTab(item)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs transition-colors ${
                isActive
                  ? "bg-fg text-bg font-semibold"
                  : "border border-line bg-surface text-muted hover:border-line-strong hover:text-fg font-medium"
              }`}
            >
              {item}
            </button>
          );
        })}
      </nav>

      {/* 3. Metrics Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <WorkspaceCard
          title="Files"
          value={`${assets.length} private object${assets.length === 1 ? "" : "s"}`}
          detail="Encrypted masters, subtitles, artwork in private storage."
        />
        <WorkspaceCard
          title="QC Status"
          value={title.masterKey ? "Master Verified" : "Master Missing"}
          detail="Technical validation required before distribution clearance."
        />
        <WorkspaceCard
          title="Rights & Avails"
          value={title.status === "RIGHTS_REVIEW" ? "Under Review" : "Bridge Controlled"}
          detail="Territory, language and exclusivity recorded authoritatively."
        />
        <WorkspaceCard
          title="Distribution"
          value={pub?.authorizationStatus ? pub.authorizationStatus.toUpperCase() : "Not Authorized"}
          detail="Crayons Loop destination requires verified authorization."
        />
      </section>

      {/* Tab: Distribution */}
      {activeTab === "Distribution" || pub ? (
        <section className="rounded-2xl border border-line bg-surface p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Master Distribution
              </p>
              <h2 className="font-display text-2xl font-semibold text-fg">
                Distribution Authorization
              </h2>
              <p className="mt-1 text-xs text-muted">
                Authorize master title delivery to consumer destinations (Crayons Loop).
              </p>
            </div>

            {canDistribute && !pub && !distributeOpen ? (
              <Button
                type="button"
                disabled={!isDistributionEligible}
                onClick={() => setDistributeOpen(true)}
                className="rounded-full text-xs font-semibold px-5 h-9"
              >
                Distribute Title
              </Button>
            ) : null}
          </div>

          {/* Authorization Check Status */}
          {!isDistributionEligible ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-400">
              <p className="font-semibold">Distribution Authorization Blocked</p>
              <p className="mt-1">
                Before authorizing distribution, this title must reach at least <strong>LICENSING_READY</strong> and
                have a verified master asset uploaded. Current status: <strong>{title.status}</strong>.
              </p>
            </div>
          ) : null}

          {/* Active Publication Record */}
          {pub ? (
            <div className="rounded-xl border border-line bg-elevated/40 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-display font-semibold text-fg">Destination: Crayons Loop</span>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20 uppercase">
                    {pub.authorizationStatus}
                  </span>
                </div>

                <a
                  href="https://crayonsloop.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                >
                  <span>View on Crayons Loop</span>
                  <span>↗</span>
                </a>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted">
                <div>Model: <strong className="text-fg">{pub.exploitationModels.join(", ")}</strong></div>
                <div>Territories: <strong className="text-fg">{pub.territories.join(", ")}</strong></div>
                <div>Languages: <strong className="text-fg">{pub.languages.join(", ")}</strong></div>
                <div>
                  Window:{" "}
                  <strong className="text-fg">
                    {pub.windowEnd ? `until ${new Date(pub.windowEnd).toLocaleDateString()}` : "Perpetual"}
                  </strong>
                </div>
              </div>

              {canRevoke && (pub.authorizationStatus === "authorized" || pub.authorizationStatus === "live") ? (
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={suspendMut.isPending}
                    onClick={() => suspendMut.mutate()}
                    className="rounded-full border-line text-xs font-semibold h-8 hover:text-amber-400 hover:border-amber-500/40"
                  >
                    Suspend Distribution
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={revokeMut.isPending}
                    onClick={() => revokeMut.mutate()}
                    className="rounded-full border-line text-xs font-semibold h-8 hover:text-red-400 hover:border-red-500/40"
                  >
                    Revoke License
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Distribution Form */}
          {distributeOpen ? (
            <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
              <h3 className="font-semibold text-sm text-fg">Configure Distribution License</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Destination</span>
                  <input
                    disabled
                    value="Crayons Loop (https://crayonsloop.com/)"
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg opacity-80"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Distribution Model</span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as ExploitationModel)}
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                  >
                    <option value="SVOD">SVOD (Subscription)</option>
                    <option value="TVOD">TVOD (Transactional)</option>
                    <option value="AVOD">AVOD (Ad-supported)</option>
                    <option value="FREE">Free / Promotional</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Authorized Territories</span>
                  <input
                    value={territories}
                    onChange={(e) => setTerritories(e.target.value)}
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Authorized Languages</span>
                  <input
                    value={languages}
                    onChange={(e) => setLanguages(e.target.value)}
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Window Start</span>
                  <input
                    type="datetime-local"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Window End</span>
                  <input
                    type="datetime-local"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Rights-Owner Share (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={rightsOwnerShare}
                    onChange={(e) => setRightsOwnerShare(e.target.value)}
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-muted">Distributor Share (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={distributorShare}
                    onChange={(e) => setDistributorShare(e.target.value)}
                    className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                  />
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  disabled={distributeMut.isPending}
                  onClick={() => distributeMut.mutate()}
                  className="rounded-full text-xs font-semibold px-5 h-9"
                >
                  {distributeMut.isPending ? "Authorizing…" : "Authorize Distribution"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDistributeOpen(false)}
                  className="rounded-full border-line text-xs h-9"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Tab: Overview */}
      {title.synopsis && activeTab === "Overview" ? (
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-display text-xl font-semibold text-fg">Overview & Synopsis</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{title.synopsis}</p>
        </section>
      ) : null}

      {/* Lifecycle Advancement */}
      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-fg">Lifecycle Control</h2>
            <p className="mt-1 text-xs text-muted">
              Upload → QC → Rights → Licensing → Distribution → Delivery. RBAC permissions govern state transitions.
            </p>
          </div>
          {canAdvance ? (
            <Button
              type="button"
              disabled={advance.isPending}
              onClick={() => advance.mutate()}
              className="rounded-full text-xs font-semibold px-5 h-9"
            >
              Advance to {nxt?.replaceAll("_", " ")}
            </Button>
          ) : nxt === "LICENSED" ? (
            <p className="text-xs text-muted">License activation is triggered upon verified payment capture.</p>
          ) : null}
        </div>
      </section>

      {/* Upload Private Asset Panel */}
      {canUpload ? <UploadPanel titleId={title.id} /> : null}

      {/* Files Section */}
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-semibold text-fg">Private Assets & Media</h2>
        <ul className="mt-4 space-y-2 text-xs">
          {assets.length ? (
            assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-line bg-elevated/40 px-4 py-3 font-mono"
              >
                <span>{a.kind.toUpperCase()} · {a.id}</span>
                <span className="text-faint">SECURE S3 VAULT</span>
              </li>
            ))
          ) : (
            <li className="text-muted text-sm py-4">No private objects uploaded yet.</li>
          )}
        </ul>
      </section>

      {/* Audit History */}
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-display text-xl font-semibold text-fg">Title Updates & Audit Trail</h2>
        <ol className="mt-4 space-y-2 font-mono text-xs text-muted">
          {(titleQ.data?.events ?? []).map((e, i) => (
            <li key={`${e.createdAt}-${i}`} className="rounded-lg border border-line/60 bg-elevated/30 px-3 py-2">
              {e.createdAt} · {e.from ?? "—"} → <strong>{e.to}</strong>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function WorkspaceCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{title}</p>
      <p className="mt-2 font-display text-xl font-semibold text-fg">{value}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{detail}</p>
    </article>
  );
}

function UploadPanel({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (file: File) => {
      const kind: AssetKind = file.type.startsWith("image/") ? "poster" : "master";
      const signed = await requestAssetUpload({
        data: {
          titleId,
          kind,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        },
      });
      const put = await fetch(signed.url, {
        method: signed.method,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("S3 upload failed");
      await confirmAssetUpload({ data: { assetId: signed.assetId } });
    },
    onSuccess: () => {
      toast.success("Media asset secured");
      void qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] });
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });

  return (
    <label className="block rounded-2xl border border-dashed border-line bg-surface p-6 text-sm cursor-pointer hover:border-line-strong transition-colors">
      <span className="font-semibold text-fg">Upload Private Asset</span>
      <span className="mt-1 block text-xs text-muted">
        Master video, poster artwork, subtitles and documents are signed directly to private object storage.
      </span>
      <input
        type="file"
        className="mt-4 block w-full text-xs text-muted file:mr-4 file:rounded-full file:border-0 file:bg-elevated file:px-4 file:py-2 file:text-xs file:font-semibold file:text-fg hover:file:bg-line"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mut.mutate(file);
        }}
      />
    </label>
  );
}
