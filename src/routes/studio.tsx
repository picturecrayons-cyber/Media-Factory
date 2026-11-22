import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/studio")({ component: Studio });

type StudioSection = "titles" | "production" | "documents" | "account";

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

function StudioDashboard({ actor }: { actor: BridgeActor }) {
  const [section, setSection] = useState<StudioSection>("titles");
  const tabs: { id: StudioSection; label: string }[] = [
    { id: "titles", label: "Titles" },
    { id: "production", label: "Production & DIT" },
    { id: "documents", label: "Documents" },
    { id: "account", label: "Account" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Studio workspace</p>
          <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Manage Studio-owned titles, production media and verified documents.</p>
        </div>
        <Link to="/account" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent">Account & security ↗</Link>
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
              <h3 className="font-display text-xl font-semibold">Studio title library</h3>
              <p className="mt-1 text-sm text-muted">Finished Films and Story / Concept submissions remain separate. Only records authorized for this Studio are shown.</p>
            </div>
            <NewSubmissionPanel />
          </div>
          <TitleList empty="No finished-film titles are currently linked to this Studio organization." />
          <MyStoryConcepts />
        </section>
      ) : null}

      {section === "production" ? (
        <section className="space-y-4">
          <div>
            <h3 className="font-display text-xl font-semibold">Production & DIT</h3>
            <p className="mt-1 text-sm text-muted">Register camera-card manifests, verify copies and record operator sign-off against an authorized title.</p>
          </div>
          <DitAgentDesk actor={actor} />
        </section>
      ) : null}

      {section === "documents" ? (
        <section className="space-y-4">
          <div>
            <h3 className="font-display text-xl font-semibold">Private Document Vault</h3>
            <p className="mt-1 text-sm text-muted">Upload verified agreements and ownership evidence, then link them to eligible title records. Uploading a document does not approve Legal or Rights.</p>
          </div>
          <CreatorDocumentVault />
        </section>
      ) : null}

      {section === "account" ? (
        <section className="max-w-2xl space-y-4 rounded-xl border border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-xl font-semibold">Studio account</h3>
            <p className="mt-1 text-sm text-muted">Verified organization identity and account access.</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Organization</dt><dd className="mt-1 font-medium">{actor.organizationName || "Not available"}</dd></div>
            <div><dt className="text-xs text-muted">Signed-in account</dt><dd className="mt-1 font-medium">{actor.displayName}</dd></div>
          </dl>
          <Link to="/account" className="inline-flex text-sm font-semibold text-accent hover:underline">Manage account & security ↗</Link>
        </section>
      ) : null}

      <footer className="border-t border-line pt-4 text-xs text-muted">
        Studio access is restricted to verified organization membership. QC, Legal, Rights, licensing and publication decisions remain separate.
      </footer>
    </div>
  );
}
