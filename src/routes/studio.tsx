import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import type { BridgeActor } from "@/lib/bridge/session";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { MediaWorkspaceDesk } from "@/components/bridge/media-workspace-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

type StudioTab = "films" | "stories" | "members" | "storage" | "post-production" | "dit";
type StudioActor = BridgeActor;

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio workspace">
          <StudioDashboard actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StudioDashboard({ actor }: { actor: StudioActor }) {
  const [activeTab, setActiveTab] = useState<StudioTab>("films");
  const tabs: Array<{ id: StudioTab; label: string }> = [
    { id: "films", label: "Finished Films" },
    { id: "stories", label: "Story & Concept" },
    { id: "members", label: "Members" },
    { id: "storage", label: "Storage / Media Vault" },
    { id: "post-production", label: "Post-Production" },
    { id: "dit", label: "DIT Agent" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 pb-16">
      <header className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Studio Desk</p>
            <h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Submit finished films, track Story & Concept curation and view the verified member roster. Title visibility is restricted to your signed-in Studio organization.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/deliveries" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent">Deliveries</Link>
            <Link to="/account" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent">Account & access</Link>
          </div>
        </div>
        <div className="mt-6"><NewSubmissionPanel /></div>
      </header>

      <nav aria-label="Studio workspace tabs" role="tablist" className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
            aria-controls={"studio-panel-" + tab.id} id={"studio-tab-" + tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={"shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold transition " + (activeTab === tab.id ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:text-fg")}>
            {tab.label}
          </button>
        ))}
      </nav>

      <section id={"studio-panel-" + activeTab} role="tabpanel" aria-labelledby={"studio-tab-" + activeTab} className="min-h-64 space-y-4">
        {activeTab === "films" ? (
          <>
            <div><h2 className="font-display text-xl font-semibold">Finished-film submissions</h2><p className="mt-1 text-sm text-muted">Continue an existing title or open it to manage metadata, assets and review status.</p></div>
            <TitleList actor={actor} empty="No finished-film submissions are available for this Studio organization yet." />
          </>
        ) : activeTab === "stories" ? (
          <>
            <div><h2 className="font-display text-xl font-semibold">Story & Concept submissions</h2><p className="mt-1 text-sm text-muted">Concepts follow a separate curation path. They are not finished films and are not automatically published to buyers.</p></div>
            <MyStoryConcepts actor={actor} />
          </>
        ) : activeTab === "members" ? (
          <>
            <div><h2 className="font-display text-xl font-semibold">Studio members</h2><p className="mt-1 text-sm text-muted">Verified organization roster. This view is read-only; invitations and role changes are not enabled in this release.</p></div>
            <StudioMemberDesk actor={actor} />
          </>
        ) : activeTab === "storage" ? (
          <MediaWorkspaceDesk actor={actor} mode="storage" />
        ) : activeTab === "post-production" ? (
          <MediaWorkspaceDesk actor={actor} mode="post-production" />
        ) : (
          <DitAgentDesk actor={actor} />
        )}
      </section>

      <p className="rounded-xl border border-line p-4 text-xs leading-5 text-muted">Automated production scheduling and media transfers, membership invitations, editable roles, financial statements and portfolio analytics are not enabled here. The DIT Agent currently records manifest and operator-submitted copy-verification evidence only; it does not perform OCI camera-media transfers. QC, rights, licensing and publication approvals remain with their designated Bridge reviewers.</p>
    </div>
  );
}
