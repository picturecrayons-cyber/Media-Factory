import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { inviteInternalRole } from "@/lib/bridge/profiles";
import { listAuditLogs, listTitles } from "@/lib/bridge/titles";
import {
  authorizeLoopPublication,
  listLoopPublicationReadiness,
  suspendLoopPublication,
  revokeLoopPublication,
  extendDistributionWindow,
  type ExploitationModel,
} from "@/lib/bridge/loop-publication";
import { INTERNAL_ROLES } from "@/lib/bridge/types";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/internal")({ component: Internal });

function Internal() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} title="Distribution & Operations Desk">
          <p className="mb-6 text-xs text-muted">
            {actor.internalRole?.replaceAll("_", " ")} · {actor.email}
          </p>
          <InternalBody
            canInvite={hasPermission(actor, "users.invite_internal")}
            canPublish={hasPermission(actor, "loop.publish")}
            canRevoke={hasPermission(actor, "loop.revoke")}
          />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InternalBody({
  canInvite,
  canPublish,
  canRevoke,
}: {
  canInvite: boolean;
  canPublish: boolean;
  canRevoke: boolean;
}) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const logsQ = useQuery({ queryKey: ["bridge-audit"], queryFn: () => listAuditLogs() });
  const titles = titlesQ.data?.titles ?? [];
  if (titlesQ.isError || logsQ.isError)
    return <p role="alert">Operations data could not be loaded. Refresh to retry.</p>;

  return (
    <div className="grid gap-12">
      {/* 1. Master Distribution Desk */}
      <DistributionDesk canPublish={canPublish} canRevoke={canRevoke} />

      {/* 2. Team Invitation Module */}
      {canInvite ? <InviteForm /> : null}

      {/* 3. Catalog Queue */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold text-fg">Catalog Titles</h2>
            <p className="text-xs text-muted">Master titles currently recorded in Crayons Bridge</p>
          </div>
          <span className="text-xs font-mono text-muted">
            {titles.length} title{titles.length === 1 ? "" : "s"}
          </span>
        </div>

        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {titles.length ? (
            titles.map((t) => (
              <li key={t.id}>
                <Link
                  to="/title/$id"
                  params={{ id: t.id }}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-elevated/50 transition-colors"
                >
                  <div>
                    <span className="font-medium text-fg">{t.name}</span>
                    <span className="ml-2 text-xs text-muted font-mono">{t.id}</span>
                  </div>
                  <StatusChip status={t.status} />
                </Link>
              </li>
            ))
          ) : (
            <li className="px-5 py-8 text-center text-sm text-muted">No titles in the pipeline.</li>
          )}
        </ul>
      </section>

      {/* 4. Immutable Audit Trail */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-fg">Audit Ledger</h2>
          <p className="text-xs text-muted">Cryptographically auditable operational decisions</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <ul className="max-h-80 overflow-y-auto space-y-2 font-mono text-xs text-muted">
            {(logsQ.data?.logs ?? []).map((l) => (
              <li
                key={l.id}
                className="rounded-lg border border-line/60 bg-elevated/40 px-3 py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {l.createdAt} · <strong>{l.action}</strong>
                </span>
                <span className="text-faint">
                  {l.entityType}:{l.entityId}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

const DISTRIBUTION_TABS = [
  "Ready for Distribution",
  "Destinations",
  "Authorizations",
  "Deliveries",
  "Live",
  "Suspended",
  "Expired",
  "Failed",
] as const;

type DistTab = (typeof DISTRIBUTION_TABS)[number];

function DistributionDesk({ canPublish, canRevoke }: { canPublish: boolean; canRevoke: boolean }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<DistTab>("Ready for Distribution");

  const q = useQuery({
    queryKey: ["loop-publication-readiness"],
    queryFn: () => listLoopPublicationReadiness(),
  });

  // Authorization Form State
  const [selectedTitleId, setSelectedTitleId] = useState<string>("");
  const [territories, setTerritories] = useState("IN");
  const [languages, setLanguages] = useState("Malayalam");
  const [model] = useState<ExploitationModel>("TVOD");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [rightsOwnerShare, setRightsOwnerShare] = useState<string>("80");
  const [distributorShare, setDistributorShare] = useState<string>("20");
  const [extendTitleId, setExtendTitleId] = useState<string | null>(null);
  const [newExtendEnd, setNewExtendEnd] = useState<string>("");

  const publishMut = useMutation({
    mutationFn: (bridgeTitleId: string) =>
      authorizeLoopPublication({
        data: {
          bridgeTitleId,
          destination: "CRAYONS_LOOP",
          territories: territories
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          languages: languages
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          exploitationModels: [model],
          accessTier: "TVOD",
          windowStart: windowStart ? new Date(windowStart).toISOString() : null,
          windowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
          commercialTerms: {
            rightsOwnerSharePct: Number(rightsOwnerShare) || 0,
            distributorSharePct: Number(distributorShare) || 0,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Title authorized and published to Crayons Loop");
      setSelectedTitleId("");
      void qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] });
      void qc.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Distribution authorization failed"),
  });

  const suspendMut = useMutation({
    mutationFn: (bridgeTitleId: string) =>
      suspendLoopPublication({ data: { bridgeTitleId, reason: "Operator suspension" } }),
    onSuccess: () => {
      toast.success("Publication suspended");
      void qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] });
      void qc.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Suspension failed"),
  });

  const revokeMut = useMutation({
    mutationFn: (bridgeTitleId: string) => revokeLoopPublication({ data: { bridgeTitleId } }),
    onSuccess: () => {
      toast.success("Distribution authorization revoked");
      void qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] });
      void qc.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Revocation failed"),
  });

  const extendMut = useMutation({
    mutationFn: ({
      bridgeTitleId,
      newWindowEnd,
    }: {
      bridgeTitleId: string;
      newWindowEnd: string;
    }) =>
      extendDistributionWindow({
        data: { bridgeTitleId, newWindowEnd: new Date(newWindowEnd).toISOString() },
      }),
    onSuccess: () => {
      toast.success("Distribution window extended");
      setExtendTitleId(null);
      void qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] });
      void qc.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Window extension failed"),
  });

  const allTitles = q.data?.titles ?? [];
  if (q.isPending) return <p>Loading distribution readiness…</p>;
  if (q.isError)
    return <p role="alert">Distribution readiness is unavailable. Refresh to retry.</p>;

  // Filter based on active tab
  const filteredTitles = allTitles.filter((t) => {
    const pubStatus = t.publication?.authorizationStatus?.toLowerCase();
    switch (activeTab) {
      case "Ready for Distribution":
        return t.ready && (!t.publication || pubStatus === "pending" || pubStatus === "draft");
      case "Destinations":
        return true; // shows destination overview
      case "Authorizations":
        return Boolean(t.publication);
      case "Deliveries":
        return Boolean(t.publication && t.hasMaster);
      case "Live":
        return pubStatus === "live" || pubStatus === "authorized";
      case "Suspended":
        return pubStatus === "suspended";
      case "Expired":
        return pubStatus === "expired";
      case "Failed":
        return pubStatus === "failed";
      default:
        return true;
    }
  });

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Master Control Plane
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-fg">
            Distribution Desk
          </h2>
          <p className="mt-1 text-xs text-muted">
            Bridge authorizes master titles for consumer destinations and external distribution
            licenses.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-line pb-2.5 text-xs font-medium">
        {DISTRIBUTION_TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3.5 py-1.5 transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-fg text-bg font-semibold"
                  : "bg-surface text-muted border border-line hover:text-fg hover:border-line-strong"
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Destination tab summary */}
      {activeTab === "Destinations" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-semibold text-fg">Crayons Loop</span>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                ACTIVE DESTINATION
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Consumer streaming OTT destination. Receives authorized titles via Bridge control
              plane.
            </p>
            <div className="text-xs text-muted space-y-1">
              <div>
                Destination URL: <strong className="text-fg">https://crayonsloop.in/</strong>
              </div>
              <div>
                Supported Model: <strong className="text-fg">TVOD rental only</strong>
              </div>
              <div>
                Active Authorized Titles:{" "}
                <strong className="text-fg">
                  {
                    allTitles.filter(
                      (t) =>
                        t.publication?.authorizationStatus?.toLowerCase() === "live" ||
                        t.publication?.authorizationStatus?.toLowerCase() === "authorized",
                    ).length
                  }
                </strong>
              </div>
            </div>
            <div className="pt-2">
              <a
                href="https://crayonsloop.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                <span>Open Crayons Loop Consumer OTT</span>
                <span>↗</span>
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-line/60 bg-surface/50 p-6 space-y-3 opacity-60">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-semibold text-fg">
                External Buyers / Television
              </span>
              <span className="rounded-full bg-faint/20 px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                PLANNED
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Secondary OTT and broadcast partner delivery desks will activate as commercial
              contracts are executed.
            </p>
          </div>
        </div>
      ) : null}

      {/* Authorization form modal/drawer if title selected */}
      {selectedTitleId ? (
        <div className="rounded-2xl border border-accent/30 bg-surface p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-fg">
              Authorize Distribution: {allTitles.find((t) => t.id === selectedTitleId)?.name}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedTitleId("")}
              className="text-xs text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <label className="block space-y-1">
              <span className="font-semibold text-muted">Territories (comma-separated)</span>
              <input
                value={territories}
                onChange={(e) => setTerritories(e.target.value)}
                className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                placeholder="IN, AE, US"
              />
            </label>

            <label className="block space-y-1">
              <span className="font-semibold text-muted">Languages</span>
              <input
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                className="h-9 w-full rounded-xl border border-line bg-elevated px-3 text-fg focus:outline-none"
                placeholder="Malayalam, Tamil"
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
              disabled={publishMut.isPending}
              onClick={() => publishMut.mutate(selectedTitleId)}
              className="rounded-full px-5 text-xs font-semibold"
            >
              {publishMut.isPending
                ? "Validating & Authorizing…"
                : "Authorize & Publish to Crayons Loop"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedTitleId("")}
              className="rounded-full border-line text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* Extend Window Dialog */}
      {extendTitleId ? (
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h4 className="font-semibold text-sm text-fg">Extend Distribution Window</h4>
          <p className="text-xs text-muted">
            Specify the new window end date for distribution entitlement.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="datetime-local"
              value={newExtendEnd}
              onChange={(e) => setNewExtendEnd(e.target.value)}
              className="h-9 rounded-xl border border-line bg-elevated px-3 text-xs text-fg focus:outline-none"
            />
            <Button
              type="button"
              disabled={!newExtendEnd || extendMut.isPending}
              onClick={() =>
                extendMut.mutate({ bridgeTitleId: extendTitleId, newWindowEnd: newExtendEnd })
              }
              className="rounded-full text-xs font-semibold px-4"
            >
              Save Extended Window
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExtendTitleId(null)}
              className="rounded-full border-line text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* Main List */}
      <div className="space-y-4">
        {filteredTitles.map((t) => {
          const pub = t.publication;
          const statusDisplay = pub?.authorizationStatus || (t.ready ? "READY" : "HOLD");
          return (
            <article
              key={t.id}
              className="rounded-2xl border border-line bg-surface p-5 space-y-4 shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-display text-lg font-semibold text-fg">{t.name}</h3>
                    <span className="text-xs font-mono text-muted">{t.language}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Bridge Status: <strong className="text-fg">{t.bridgeStatus}</strong> · QC
                    Master:{" "}
                    <strong className={t.hasMaster ? "text-emerald-400" : "text-amber-400"}>
                      {t.hasMaster ? "VERIFIED" : "MISSING"}
                    </strong>{" "}
                    · Artwork:{" "}
                    <strong className={t.hasPoster ? "text-emerald-400" : "text-amber-400"}>
                      {t.hasPoster ? "READY" : "MISSING"}
                    </strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                      statusDisplay === "LIVE" || statusDisplay === "AUTHORIZED"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : statusDisplay === "SUSPENDED"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : statusDisplay === "REVOKED" || statusDisplay === "EXPIRED"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-elevated text-muted border border-line"
                    }`}
                  >
                    {statusDisplay}
                  </span>
                </div>
              </div>

              {/* Blockers or Readiness feedback */}
              {t.blockers.length ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                  <strong>Requirements Pending:</strong> {t.blockers.join(" · ")}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400">
                  Technical and legal readiness satisfied. Cleared for distribution authorization.
                </div>
              )}

              {/* Distribution Details if exists */}
              {pub ? (
                <div className="grid gap-2 sm:grid-cols-4 rounded-xl border border-line bg-elevated/40 p-3 text-xs text-muted">
                  <div>
                    Destination: <strong className="text-fg">Crayons Loop</strong>
                  </div>
                  <div>
                    Territories: <strong className="text-fg">{pub.territories.join(", ")}</strong>
                  </div>
                  <div>
                    Models: <strong className="text-fg">{pub.exploitationModels.join(", ")}</strong>
                  </div>
                  <div>
                    Window:{" "}
                    <strong className="text-fg">
                      {pub.windowEnd
                        ? `until ${new Date(pub.windowEnd).toLocaleDateString()}`
                        : "Perpetual / Open"}
                    </strong>
                  </div>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {canPublish &&
                (!pub ||
                  pub.authorizationStatus === "SUSPENDED" ||
                  pub.authorizationStatus === "EXPIRED" ||
                  pub.authorizationStatus === "DRAFT") ? (
                  <Button
                    type="button"
                    disabled={!t.ready}
                    onClick={() => setSelectedTitleId(t.id)}
                    className="rounded-full text-xs font-semibold px-4 h-9"
                  >
                    {pub ? "Re-authorize & Distribute" : "Distribute to Crayons Loop"}
                  </Button>
                ) : null}

                {canRevoke &&
                pub &&
                (pub.authorizationStatus === "LIVE" || pub.authorizationStatus === "AUTHORIZED") ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={suspendMut.isPending}
                      onClick={() => suspendMut.mutate(t.id)}
                      className="rounded-full border-line text-xs font-semibold h-9 hover:border-amber-500/40 hover:text-amber-400"
                    >
                      Suspend
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={revokeMut.isPending}
                      onClick={() => revokeMut.mutate(t.id)}
                      className="rounded-full border-line text-xs font-semibold h-9 hover:border-red-500/40 hover:text-red-400"
                    >
                      Revoke Authorization
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setExtendTitleId(t.id);
                        setNewExtendEnd(
                          pub.windowEnd ? new Date(pub.windowEnd).toISOString().slice(0, 16) : "",
                        );
                      }}
                      className="rounded-full border-line text-xs font-semibold h-9"
                    >
                      Extend Window
                    </Button>
                  </>
                ) : null}

                {pub?.published ? (
                  <a
                    href="https://crayonsloop.in/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-elevated px-3.5 py-1.5 text-xs font-semibold text-muted hover:text-accent transition-colors"
                  >
                    <span>View on Crayons Loop</span>
                    <span>↗</span>
                  </a>
                ) : null}

                <Link
                  to="/title/$id"
                  params={{ id: t.id }}
                  className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-muted hover:text-fg hover:border-line-strong transition-colors"
                >
                  Open Title Workspace →
                </Link>
              </div>
            </article>
          );
        })}

        {!filteredTitles.length ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">
            No records in the <strong>{activeTab}</strong> queue.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InviteForm() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INTERNAL_ROLES)[number]>("viewer");

  const mut = useMutation({
    mutationFn: () => inviteInternalRole({ data: { email, role } }),
    onSuccess: () => {
      toast.success("Internal role invite sent");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Invite failed"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3"
    >
      <div className="sm:col-span-3">
        <h3 className="font-display text-lg font-semibold text-fg">Team & Permissions</h3>
        <p className="text-xs text-muted">
          Invite internal team reviewers for QC, Legal, Licensing or Operations.
        </p>
      </div>

      <label className="text-xs font-semibold text-muted sm:col-span-2">
        Team member email
        <input
          required
          type="email"
          placeholder="colleague@crayonspictures.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <label className="text-xs font-semibold text-muted">
        Internal Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as (typeof INTERNAL_ROLES)[number])}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg focus:border-accent focus:outline-none"
        >
          {INTERNAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>

      <div className="sm:col-span-3">
        <Button
          type="submit"
          disabled={mut.isPending}
          className="rounded-full px-5 text-xs font-semibold"
        >
          {mut.isPending ? "Sending invite…" : "Send internal invitation"}
        </Button>
      </div>
    </form>
  );
}
