import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import type { BridgeActor } from "@/lib/bridge/session";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";

export const Route = createFileRoute("/studio")({ component: Studio });

type StudioSection = "titles" | "production" | "documents" | "account";

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => <BridgeShell actor={actor} title="Studio workspace"><StudioDashboard actor={actor} /></BridgeShell>}
    </RequireBridge>
  );
}

function StudioDashboard({ actor }: { actor: BridgeActor }) {
  const [section, setSection] = useState<StudioSection>("titles");
  const tabs: { id: StudioSection; label: string }[] = [
    { id: "titles", label: "Titles" },
    { id: "production", label: "Production & DIT" },
    { id: "documents", label: "Document Vault" },
    { id: "account", label: "Account" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Studio workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Your studio’s titles, production media and verified documents.</p>
        </div>
        <Link to="/deliveries" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent">Deliveries ↗</Link>
      </header>

      <nav aria-label="Studio workspace sections" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setSection(tab.id)} aria-current={section === tab.id ? "page" : undefined}
            className={section === tab.id ? "rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg" : "rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-fg"}>
            {tab.label}
          </button>
        ))}
      </nav>

      {section === "titles" ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold">Title Library</h3>
              <p className="mt-1 text-sm text-muted">Finished films and Story / Concept records are searchable and remain separate in their workflow.</p>
            </div>
            <Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">Open full workspace ↗</Link>
          </div>
          <TitleList empty="No titles are currently authorized for this Studio organization." />
          <MyStoryConcepts />
          <details className="rounded-xl border border-line bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Create a title or concept</summary>
            <div className="border-t border-line p-4">
              <NewSubmissionPanel />
            </div>
          </details>
        </section>
      ) : null}

      {section === "production" ? (
        <section className="space-y-6">
          <div>
            <h3 className="font-display text-xl font-semibold">Production & DIT</h3>
            <p className="mt-1 text-sm text-muted">Camera-card registration, source manifests, copy verification evidence and operator sign-off.</p>
          </div>
          <DitAgentDesk actor={actor} />
          <div className="rounded-xl border border-line p-4">
            <h4 className="font-semibold">Members & Roles</h4>
            <p className="mt-1 text-sm text-muted">Read-only Studio roster. Invitations and role changes remain disabled until the approved server-side membership workflow is available.</p>
            <div className="mt-3"><StudioMemberDesk /></div>
          </div>
          <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            Production tracking and shared scheduling are not connected yet. No sample productions, member actions or financial values are displayed.
          </div>
        </section>
      ) : null}

      {section === "documents" ? (
        <section className="space-y-3">
          <div>
            <h3 className="font-display text-xl font-semibold">Document Vault</h3>
            <p className="mt-1 text-sm text-muted">Private rights and ownership documents, verified before linking to your title records.</p>
          </div>
          <CreatorDocumentVault />
        </section>
      ) : null}

      {section === "account" ? (
        <section className="max-w-2xl space-y-4 rounded-xl border border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-xl font-semibold">Studio account</h3>
            <p className="mt-1 text-sm text-muted">Organization identity and verified account access.</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Organization</dt><dd className="mt-1 font-medium">{actor.organizationName || "Not available"}</dd></div>
            <div><dt className="text-xs text-muted">Signed-in account</dt><dd className="mt-1 font-medium">{actor.displayName}</dd></div>
          </dl>
          <Link to="/account" className="inline-flex text-sm font-semibold text-accent hover:underline">Manage account & security ↗</Link>
        </section>
      ) : null}
    </div>
  );
}
