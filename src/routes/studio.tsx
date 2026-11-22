import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio Home">
          <div className="mx-auto max-w-6xl space-y-5 pb-16">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Studio workspace</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{actor.organizationName || actor.displayName}</h2>
                <p className="mt-1 text-sm text-muted">Manage your studio’s titles and production handover.</p>
              </div>
              <Link to="/deliveries" className="text-sm font-semibold text-accent hover:underline">View deliveries</Link>
            </header>

            <section id="titles" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Studio titles</h3>
                  <p className="text-sm text-muted">Finished films and Story / Concept submissions.</p>
                </div>
                <NewSubmissionPanel />
              </div>
              <TitleList empty="No finished-film titles are currently linked to this Studio organization." />
              <MyStoryConcepts />
            </section>

            <section className="border-t border-line pt-4">
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold">
                  <span>Studio tools</span><span className="text-xs font-normal text-muted">Production · Documents · Members</span>
                </summary>
                <div className="mt-3 space-y-3">
                  <details className="rounded-xl border border-line bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-medium">Production & DIT</summary>
                    <p className="mt-1 text-xs text-muted">Camera-card ingest, checksum evidence and copy verification.</p>
                    <div className="mt-4 border-t border-line pt-4"><DitAgentDesk actor={actor} /></div>
                  </details>
                  <details className="rounded-xl border border-line bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-medium">Private document vault</summary>
                    <p className="mt-1 text-xs text-muted">Verified agreements and title-linked evidence.</p>
                    <div className="mt-4 border-t border-line pt-4"><CreatorDocumentVault /></div>
                  </details>
                  <details className="rounded-xl border border-line bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-medium">Members & roles</summary>
                    <p className="mt-1 text-xs text-muted">Verified Studio organization roster. Role changes remain disabled.</p>
                    <div className="mt-4 border-t border-line pt-4"><StudioMemberDesk /></div>
                  </details>
                </div>
              </details>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
              <p>Titles and Studio tools are restricted to verified organization membership. QC, Legal, rights and publishing remain separate.</p>
              <Link to="/account" className="font-semibold hover:text-fg">Studio account</Link>
            </footer>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
