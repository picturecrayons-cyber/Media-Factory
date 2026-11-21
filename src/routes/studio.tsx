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
        <BridgeShell actor={actor} title="Studio workspace">
          <div className="mx-auto max-w-6xl space-y-6 px-1 pb-16">
            <header className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Studio Desk</p>
                  <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{actor.organizationName || actor.displayName}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted">One workspace for studio titles, production handover, rights documents and team access.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to="/deliveries" className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:border-accent">Deliveries</Link>
                  <Link to="/account" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg">Studio account</Link>
                </div>
              </div>
              <nav className="mt-5 grid gap-2 sm:grid-cols-4" aria-label="Studio workspace navigation">
                <a href="#titles" className="rounded-xl bg-bg p-3 text-sm font-semibold hover:ring-1 hover:ring-accent">Studio titles<span className="block text-xs font-normal text-muted">Films and concepts</span></a>
                <a href="#production" className="rounded-xl bg-bg p-3 text-sm font-semibold hover:ring-1 hover:ring-accent">Production & DIT<span className="block text-xs font-normal text-muted">Media ingest and sign-off</span></a>
                <a href="#documents" className="rounded-xl bg-bg p-3 text-sm font-semibold hover:ring-1 hover:ring-accent">Documents<span className="block text-xs font-normal text-muted">Private legal evidence</span></a>
                <a href="#members" className="rounded-xl bg-bg p-3 text-sm font-semibold hover:ring-1 hover:ring-accent">Members & roles<span className="block text-xs font-normal text-muted">Organization access</span></a>
              </nav>
            </header>

            <section id="titles" className="scroll-mt-20 space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Catalogue</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">Studio titles & submissions</h2>
                <p className="mt-1 text-sm text-muted">Finished films and story concepts are separate submission paths. QC, rights and licensing approvals remain independent.</p>
              </div>
              <NewSubmissionPanel />
              <div className="border-t border-line pt-4">
                <h3 className="mb-3 font-semibold">Your studio catalogue</h3>
                <TitleList empty="No titles are currently returned for this Studio account." />
                <div className="mt-4"><MyStoryConcepts /></div>
              </div>
            </section>

            <section id="production" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <details>
                <summary className="cursor-pointer list-none font-semibold">
                  <span className="flex items-center justify-between gap-3">Production & DIT Ingest <span className="text-sm font-normal text-muted">Open operations ↓</span></span>
                  <span className="mt-1 block text-sm font-normal text-muted">Register camera-card manifests, verify Primary and Recovery copies, and record DIT sign-off.</span>
                </summary>
                <div className="mt-4 border-t border-line pt-4"><DitAgentDesk actor={actor} /></div>
              </details>
            </section>

            <section id="documents" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <details>
                <summary className="cursor-pointer list-none font-semibold">
                  <span className="flex items-center justify-between gap-3">Private Documents & Rights Evidence <span className="text-sm font-normal text-muted">Open vault ↓</span></span>
                  <span className="mt-1 block text-sm font-normal text-muted">Upload signed agreements and link verified documents to studio-owned titles.</span>
                </summary>
                <div className="mt-4 border-t border-line pt-4"><CreatorDocumentVault /></div>
              </details>
            </section>

            <section id="members" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <details>
                <summary className="cursor-pointer list-none font-semibold">
                  <span className="flex items-center justify-between gap-3">Members & Roles <span className="text-sm font-normal text-muted">Open roster ↓</span></span>
                  <span className="mt-1 block text-sm font-normal text-muted">View verified organization members and their current access roles.</span>
                </summary>
                <div className="mt-4 border-t border-line pt-4">
                  <StudioMemberDesk />
                  <p className="mt-3 text-xs text-muted">Read-only roster. Invitations, role changes, suspensions and removals remain disabled until the audited membership workflow is enabled.</p>
                </div>
              </details>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
              <p>Studio visibility follows verified organization membership and title authorization. QC, Legal and delivery permissions remain separate.</p>
              <Link to="/account" className="font-semibold hover:text-fg">Manage studio account →</Link>
            </footer>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
