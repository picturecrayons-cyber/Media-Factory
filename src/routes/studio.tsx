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

const studioModules = [
  ["Organization", "Studio profile and verified organization identity.", "Read-only until organization mapping is confirmed."],
  ["Members & Roles", "Verified members and least-privilege access.", "Roster is read-only; role changes require a separate approved workflow."],
  ["Productions", "Production stages, schedules and title ownership.", "Production project tracking is not connected yet."],
  ["QC & Rights", "Independent quality, legal and rights review.", "Use each title's authoritative review status."],
  ["Deliveries", "Certified masters and delivery handover.", "Open Deliveries for available records."],
  ["Schedule", "Production and delivery milestones.", "Shared studio schedule is not connected yet."],
  ["Statements", "Verified licensing receipts and settlements.", "Financial statements are not connected yet."],
  ["Insights", "Verified portfolio activity.", "Studio analytics are not connected yet."],
  ["Help", "Studio onboarding and production support.", "Use the existing Bridge support channel."],
] as const;

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio dashboard">
          <div className="mx-auto max-w-7xl space-y-6 px-1 pb-16">
            <section id="home" className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
                <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">One workspace for title ownership, production operations, secure documents, DIT ingest and delivery tracking.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/deliveries" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">View deliveries</Link>
                <Link to="/account" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg">Studio account</Link>
              </div>
            </section>

            <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Studio workspace navigation">
              <a href="#studio-titles" className="rounded-lg border border-line bg-surface p-3 hover:border-accent"><strong className="text-sm">Titles</strong><p className="mt-1 text-xs text-muted">Films and story concepts</p></a>
              <a href="#studio-production" className="rounded-lg border border-line bg-surface p-3 hover:border-accent"><strong className="text-sm">Production</strong><p className="mt-1 text-xs text-muted">Production & DIT operations</p></a>
              <a href="#studio-documents" className="rounded-lg border border-line bg-surface p-3 hover:border-accent"><strong className="text-sm">Document Vault</strong><p className="mt-1 text-xs text-muted">Private reusable legal evidence</p></a>
              <a href="#studio-members" className="rounded-lg border border-line bg-surface p-3 hover:border-accent"><strong className="text-sm">Members & Roles</strong><p className="mt-1 text-xs text-muted">Verified organization access</p></a>
              <a href="#studio-operations" className="rounded-lg border border-line bg-surface p-3 hover:border-accent"><strong className="text-sm">Operations</strong><p className="mt-1 text-xs text-muted">QC, delivery and reporting</p></a>
            </nav>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
              <div className="min-w-0 space-y-6">
                <section id="studio-titles" className="space-y-4 rounded-xl border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Catalogue workspace</p>
                      <h3 className="mt-1 font-display text-xl font-semibold">Studio titles</h3>
                      <p className="mt-1 text-sm text-muted">Finished films and story concepts stay separate. Submission does not bypass QC, rights or licensing approvals.</p>
                    </div>
                    <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">Server-authorized titles</span>
                  </div>
                  <NewSubmissionPanel />
                  <div className="border-t border-line pt-4">
                    <h4 className="mb-3 font-semibold">Finished films</h4>
                    <TitleList empty="No finished films are currently returned for this studio account." />
                    <div className="mt-5">
                      <MyStoryConcepts />
                    </div>
                  </div>
                </section>

                <section id="studio-documents" className="scroll-mt-20">
                  <CreatorDocumentVault />
                </section>
              </div>

              <aside className="min-w-0 space-y-6">
                <section id="studio-members" className="scroll-mt-20 rounded-xl border border-line bg-surface p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Organization access</p>
                  <h3 className="mt-1 font-display text-xl font-semibold">Members & Roles</h3>
                  <p className="mt-1 mb-4 text-sm text-muted">Verified Studio owner and administrator roster. Invitations and role changes remain disabled until the dedicated approval flow is enabled.</p>
                  <StudioMemberDesk />
                </section>

                <section id="studio-production" className="scroll-mt-20 rounded-xl border border-line bg-surface p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Media operations</p>
                  <h3 className="mt-1 font-display text-xl font-semibold">Production & DIT</h3>
                  <p className="mt-1 mb-4 text-sm text-muted">Register camera-card manifests, verify Primary and Recovery copies and record operator sign-off.</p>
                  <DitAgentDesk actor={actor} />
                </section>
              </aside>
            </div>

            <section id="studio-operations" className="scroll-mt-20 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Workspace map</p>
                <h3 className="mt-1 font-display text-xl font-semibold">Studio operations</h3>
                <p className="mt-1 text-sm text-muted">Connected areas are linked to their existing workspaces. Unavailable data sources remain clearly marked; no synthetic records or financial values are shown.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {studioModules.map(([name, description, status]) => (
                  <article key={name} className="rounded-lg border border-line bg-surface p-4">
                    <h4 className="font-semibold">{name}</h4>
                    <p className="mt-1 text-sm text-muted">{description}</p>
                    <p className="mt-3 border-t border-line pt-3 text-xs text-muted">{status}</p>
                    {name === "Deliveries" ? <Link to="/deliveries" className="mt-3 inline-flex text-sm font-semibold text-accent underline">Open deliveries</Link> : null}
                    {name === "Organization" ? <Link to="/account" className="mt-3 inline-flex text-sm font-semibold text-accent underline">Open studio account</Link> : null}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
